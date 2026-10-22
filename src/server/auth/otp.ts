import { createHash, randomBytes, randomInt } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { isRealEmail, type EmailSettings } from "@/lib/email";
import { normalisePhone10, type WhatsappSettings } from "@/lib/whatsapp";
import { hashPassword } from "@/server/auth/password";
import { db } from "@/server/db";
import { otpCodes, users } from "@/server/db/schema";
import { getEmailSettings } from "@/server/email/settings";
import { sendOtpEmail } from "@/server/email/service";
import { sendOtpMessage } from "@/server/whatsapp/service";

/** A cryptographically secure 6-digit code (100000–999999). */
export function generateOtp(): string {
  return String(randomInt(100000, 1000000));
}

/**
 * Hash the code with the phone as salt and a server-side pepper (never stored),
 * so a database leak cannot be brute-forced offline against the 6-digit space.
 */
function hashOtp(phone: string, code: string): string {
  const pepper = process.env.OTP_PEPPER || process.env.WHATSAPP_APP_SECRET || "shivradium-otp";
  return createHash("sha256").update(`${phone}:${code}:${pepper}`).digest("hex");
}

/** Store (or replace) the active OTP for a phone. Resets attempts + lastSentAt. */
export async function storeOtp(phone: string, code: string, ttlMinutes: number): Promise<void> {
  const p = normalisePhone10(phone);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  await db
    .insert(otpCodes)
    .values({ phone: p, codeHash: hashOtp(p, code), expiresAt, attempts: 0, lastSentAt: new Date() })
    .onConflictDoUpdate({
      target: otpCodes.phone,
      set: { codeHash: hashOtp(p, code), expiresAt, attempts: 0, consumedAt: null, lastSentAt: new Date() },
    });
}

/**
 * A verified, real (non-synthetic) email on the account for this phone, or null.
 *
 * "Verified" means `users.emailVerifiedAt` is set — we never email a login code
 * to an address the customer has not proven they own. Synthetic placeholder
 * emails (OTP-only WhatsApp accounts) are excluded.
 */
async function findVerifiedEmailForPhone(phone: string): Promise<string | null> {
  const p = normalisePhone10(phone);
  const rows = await db
    .select({ email: users.email, verifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.phone, p))
    .limit(1);
  const row = rows[0];
  if (!row || !row.verifiedAt) return null;
  return isRealEmail(row.email) ? row.email : null;
}

export type IssueOtpResult = {
  code: string;
  /** True once a usable code remains (delivered, or mock-delivered in dev). */
  ok: boolean;
  /** True when the only "delivery" was a mock (nothing real went out). */
  mock: boolean;
  channels: {
    whatsapp: { ok: boolean; mock: boolean };
    email: { ok: boolean; mock: boolean; attempted: true } | { attempted: false };
  };
};

/**
 * Generate ONE secure OTP per request, store it, and send that SAME code
 * concurrently over WhatsApp and — when the account has a verified email and the
 * email channel is enabled — email (Brevo). Returns whether a usable code
 * remains, whether delivery was only mocked, and the code itself (which callers
 * must expose ONLY in non-production dev tooling, never in a production response).
 *
 * The email channel is purely additive: a customer with no verified email keeps
 * the WhatsApp-only flow unchanged, and in production the WhatsApp result still
 * decides success (email is mock-first until `EMAIL_LIVE` is turned on). Once
 * email is live, a delivery on EITHER channel keeps the code usable.
 */
export async function issueOtp(
  phone: string,
  settings: WhatsappSettings,
  userId?: string | null,
  emailSettingsOverride?: EmailSettings,
): Promise<IssueOtpResult> {
  const p = normalisePhone10(phone);
  const code = generateOtp();
  await storeOtp(p, code, settings.otpTtlMinutes);

  // Resolve the optional second channel, then dispatch BOTH concurrently with
  // the one code. getEmailSettings is read only here; findVerifiedEmailForPhone
  // runs only when the email channel is switched on.
  const emailSettings = emailSettingsOverride ?? (await getEmailSettings());
  const verifiedEmail = emailSettings.otpEnabled ? await findVerifiedEmailForPhone(p) : null;

  const [wa, mail] = await Promise.all([
    sendOtpMessage({
      phone: p,
      code,
      template: settings.templateOtp || process.env.WHATSAPP_TEMPLATE_OTP || "",
      language: settings.templateLang,
      enabled: settings.enabled,
      userId: userId ?? null,
    }),
    verifiedEmail
      ? sendOtpEmail({
          to: verifiedEmail,
          code,
          settings: emailSettings,
          ttlMinutes: settings.otpTtlMinutes,
          userId: userId ?? null,
        })
      : Promise.resolve(null),
  ]);

  const waReal = wa.ok && !wa.mock;
  const emailReal = Boolean(mail && mail.ok && !mail.mock);
  const anyReal = waReal || emailReal;
  const anyOk = wa.ok || Boolean(mail && mail.ok);

  // Keep the code only if it was really delivered on some channel, or — in dev —
  // a mock "delivery" succeeded so the flow stays testable. Otherwise remove it
  // so a non-deliverable code can never be used. Match the exact hash so a
  // concurrent, newer OTP is never deleted.
  const keep = anyReal || (process.env.NODE_ENV !== "production" && anyOk);
  if (!keep) {
    await db
      .delete(otpCodes)
      .where(and(eq(otpCodes.phone, p), eq(otpCodes.codeHash, hashOtp(p, code))));
  }

  return {
    code,
    ok: keep,
    mock: keep && !anyReal,
    channels: {
      whatsapp: { ok: wa.ok, mock: wa.mock },
      email: mail ? { ok: mail.ok, mock: mail.mock, attempted: true } : { attempted: false },
    },
  };
}

/** Seconds until a resend is allowed, 0 if allowed now. */
export async function resendWaitSeconds(phone: string, cooldownSeconds: number): Promise<number> {
  const p = normalisePhone10(phone);
  const rows = await db.select({ lastSentAt: otpCodes.lastSentAt }).from(otpCodes).where(eq(otpCodes.phone, p)).limit(1);
  if (!rows[0]) return 0;
  const elapsed = (Date.now() - rows[0].lastSentAt.getTime()) / 1000;
  return Math.max(0, Math.ceil(cooldownSeconds - elapsed));
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "no_code" | "expired" | "too_many" | "mismatch" };

/**
 * Check a submitted code. Single-use: a correct code is consumed immediately; a
 * wrong one increments attempts and is rejected once the cap is reached.
 */
export async function verifyOtp(phone: string, code: string, maxAttempts: number): Promise<VerifyResult> {
  const p = normalisePhone10(phone);
  const rows = await db.select().from(otpCodes).where(eq(otpCodes.phone, p)).limit(1);
  const row = rows[0];
  if (!row || row.consumedAt) return { ok: false, reason: "no_code" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (row.attempts >= maxAttempts) return { ok: false, reason: "too_many" };

  const matches = row.codeHash === hashOtp(p, code);
  if (!matches) {
    await db
      .update(otpCodes)
      .set({ attempts: row.attempts + 1 })
      .where(eq(otpCodes.id, row.id));
    const left = maxAttempts - (row.attempts + 1);
    return { ok: false, reason: left <= 0 ? "too_many" : "mismatch" };
  }

  // Correct — consume so it can never be replayed.
  await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, row.id));
  return { ok: true };
}

/**
 * Find the account for a verified phone, creating one on first login. New
 * accounts get a random (unguessable) password hash — they sign in by OTP — and
 * a synthetic unique email, since email is required and unique. Returns whether
 * the account was just created.
 */
export async function findOrCreateUserByPhone(
  phone: string,
): Promise<{ id: string; name: string; email: string; phone: string | null; role: "USER" | "ADMIN"; created: boolean }> {
  const p = normalisePhone10(phone);
  const existing = await db
    .select({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role })
    .from(users)
    .where(eq(users.phone, p))
    .limit(1);
  if (existing[0]) return { ...existing[0], created: false };

  const passwordHash = await hashPassword(randomBytes(24).toString("base64url"));
  const email = `wa-${p}@phone.shivradium.local`;
  const [row] = await db
    .insert(users)
    .values({ name: "WhatsApp customer", email, phone: p, passwordHash, emailVerifiedAt: null })
    .returning({ id: users.id, name: users.name, email: users.email, phone: users.phone, role: users.role });
  return { ...row, created: true };
}

/** Whether an account already exists for this phone (used for safe messaging). */
export async function phoneExists(phone: string): Promise<boolean> {
  const p = normalisePhone10(phone);
  const rows = await db.select({ id: users.id }).from(users).where(and(eq(users.phone, p))).limit(1);
  return Boolean(rows[0]);
}
