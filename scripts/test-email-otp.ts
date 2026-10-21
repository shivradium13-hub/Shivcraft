/**
 * Automated tests for the dual-channel (WhatsApp + Brevo email) login OTP.
 * Run with:  pnpm test:email
 *
 * Everything here runs in MOCK mode — EMAIL_LIVE is never set, so no real email
 * is sent and no Brevo network call is made. It exercises the real issueOtp path
 * against the database using throwaway users that are cleaned up at the end.
 * Exits non-zero on any failure, so it can sit in CI.
 */
import { eq, inArray } from "drizzle-orm";

// A dummy key proves live mode still stays OFF without EMAIL_LIVE. Never real.
process.env.BREVO_API_KEY = "test-brevo-key-DUMMY";
delete process.env.EMAIL_LIVE;

import { DEFAULT_EMAIL, isRealEmail, type EmailSettings } from "@/lib/email";
import { DEFAULT_WHATSAPP, type WhatsappSettings } from "@/lib/whatsapp";
import { hashPassword } from "@/server/auth/password";
import { issueOtp, verifyOtp } from "@/server/auth/otp";
import { db } from "@/server/db";
import { otpCodes, users } from "@/server/db/schema";
import { isEmailLiveMode, maskEmail, sendOtpEmail } from "@/server/email/service";

const PHONE_VERIFIED = "9000008888"; // has a real, verified email → dual channel
const PHONE_UNVERIFIED = "9000007777"; // email present but not verified → WhatsApp only
const PHONE_SYNTHETIC = "9000006666"; // synthetic placeholder email → WhatsApp only
const PHONES = [PHONE_VERIFIED, PHONE_UNVERIFIED, PHONE_SYNTHETIC];

const WA: WhatsappSettings = { ...DEFAULT_WHATSAPP, enabled: false, otpEnabled: true }; // enabled:false ⇒ WhatsApp mock
const EMAIL_ON: EmailSettings = {
  ...DEFAULT_EMAIL,
  enabled: true,
  otpEnabled: true,
  senderEmail: "otp@sender.test",
  senderName: "Shiv Radium Test",
};
const EMAIL_OFF: EmailSettings = { ...EMAIL_ON, otpEnabled: false };

let failures = 0;
function check(name: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

async function cleanup() {
  await db.delete(otpCodes).where(inArray(otpCodes.phone, PHONES));
  await db.delete(users).where(inArray(users.phone, PHONES));
}

async function seedUser(phone: string, email: string, verified: boolean) {
  const passwordHash = await hashPassword("test-" + phone);
  const [row] = await db
    .insert(users)
    .values({ name: "OTP test " + phone, email, phone, passwordHash, emailVerifiedAt: verified ? new Date() : null })
    .returning({ id: users.id });
  return row.id;
}

async function otpRowCount(phone: string): Promise<number> {
  const rows = await db.select({ id: otpCodes.id }).from(otpCodes).where(eq(otpCodes.phone, phone));
  return rows.length;
}

async function main() {
  console.log("\nDual-channel OTP tests (mock email)");

  // --- pure unit checks -----------------------------------------------------
  check("isRealEmail accepts a normal address", isRealEmail("person@example.com"));
  check("isRealEmail rejects a synthetic placeholder", !isRealEmail("wa-9000006666@phone.shivradium.local"));
  check("isRealEmail rejects empty / garbage", !isRealEmail("") && !isRealEmail("not-an-email"));
  check("maskEmail hides the local part", maskEmail("shivradium13@gmail.com") === "sh•••@gmail.com");

  // Live mode stays OFF without EMAIL_LIVE, even with a key + sender present.
  check("email live mode is OFF without EMAIL_LIVE", isEmailLiveMode(true, "a@b.com") === false);
  process.env.EMAIL_LIVE = "true";
  check("email live mode turns ON with EMAIL_LIVE + key + sender", isEmailLiveMode(true, "a@b.com") === true);
  check("email live mode stays OFF when disabled", isEmailLiveMode(false, "a@b.com") === false);
  check("email live mode stays OFF with no sender", isEmailLiveMode(true, "") === false);
  delete process.env.EMAIL_LIVE; // back to mock for the rest

  // sendOtpEmail in mock mode must return a mock success and make NO network call.
  const realFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
    fetchCalls++;
    return realFetch(...args);
  }) as typeof fetch;
  const mockSend = await sendOtpEmail({ to: "person@example.com", code: "123456", settings: EMAIL_ON, ttlMinutes: 5 });
  globalThis.fetch = realFetch;
  check("mock sendOtpEmail returns a mock success", mockSend.ok === true && mockSend.mock === true);
  check("mock sendOtpEmail makes no network call", fetchCalls === 0);

  // --- integration via issueOtp (mock WhatsApp + mock email) ----------------
  await cleanup();
  const idVerified = await seedUser(PHONE_VERIFIED, "verified-otp@example.com", true);
  await seedUser(PHONE_UNVERIFIED, "unverified-otp@example.com", false);
  await seedUser(PHONE_SYNTHETIC, `wa-${PHONE_SYNTHETIC}@phone.shivradium.local`, true);

  // 1) Verified email + email channel on → BOTH channels, one code.
  const r1 = await issueOtp(PHONE_VERIFIED, WA, idVerified, EMAIL_ON);
  check("verified user: a usable code remains", r1.ok === true);
  check("verified user: WhatsApp attempted (mock)", r1.channels.whatsapp.ok === true && r1.channels.whatsapp.mock === true);
  check(
    "verified user: email attempted (mock)",
    r1.channels.email.attempted === true && r1.channels.email.attempted && r1.channels.email.ok === true && r1.channels.email.mock === true,
  );
  check("verified user: exactly one OTP stored (one code for both channels)", (await otpRowCount(PHONE_VERIFIED)) === 1);
  const verified = await verifyOtp(PHONE_VERIFIED, r1.code, WA.otpMaxAttempts);
  check("verified user: the issued code verifies (same single code)", verified.ok === true);

  // 2) No verified email → WhatsApp only, email NOT attempted.
  const r2 = await issueOtp(PHONE_UNVERIFIED, WA, null, EMAIL_ON);
  check("unverified user: WhatsApp still works", r2.ok === true && r2.channels.whatsapp.ok === true);
  check("unverified user: email NOT attempted", r2.channels.email.attempted === false);

  // 3) Synthetic placeholder email → email NOT attempted even if 'verified'.
  const r3 = await issueOtp(PHONE_SYNTHETIC, WA, null, EMAIL_ON);
  check("synthetic-email user: email NOT attempted", r3.channels.email.attempted === false);

  // 4) Email channel master toggle off → email NOT attempted for a verified user.
  const r4 = await issueOtp(PHONE_VERIFIED, WA, idVerified, EMAIL_OFF);
  check("email toggle off: email NOT attempted even with a verified email", r4.channels.email.attempted === false);
  check("email toggle off: WhatsApp still works", r4.ok === true);

  // No real secret should ever surface in a result object.
  check("no API key leaks into the result", !JSON.stringify(r1).includes("DUMMY"));

  await cleanup();

  console.log(failures === 0 ? "\n✓ All dual-channel OTP tests passed\n" : `\n✗ ${failures} test(s) failed\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
