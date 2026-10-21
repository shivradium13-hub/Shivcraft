import { createHmac, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";

import { isRealEmail } from "@/lib/email";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";

/**
 * Email-ownership verification by a signed, expiring link token.
 *
 * The token is STATELESS — a base64url payload `{u,e,exp}` plus an HMAC-SHA256
 * signature over it — so no database table is needed (dev and prod share one
 * database, and this avoids a schema change). The secret lives only in env.
 *
 * Verifying is idempotent and safe: a token only sets `emailVerifiedAt` when the
 * account's CURRENT email still matches the one the token was issued for, so a
 * token for an old address can never verify a changed one, and the address is a
 * real (non-synthetic) inbox.
 */

export const EMAIL_VERIFY_TTL_MINUTES = 60;

function secret(): string {
  return (
    process.env.EMAIL_VERIFY_SECRET ||
    process.env.OTP_PEPPER ||
    process.env.WHATSAPP_APP_SECRET ||
    "shivradium-email-verify"
  );
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** A signed link token proving a request to verify `email` for `userId`. */
export function createEmailVerifyToken(userId: string, email: string): string {
  const body = { u: userId, e: email.trim().toLowerCase(), exp: Date.now() + EMAIL_VERIFY_TTL_MINUTES * 60 * 1000 };
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Validate a token's signature + expiry. Returns the claims, or null. */
export function verifyEmailVerifyToken(token: string): { userId: string; email: string } | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);
  const expectedSig = sign(payload);

  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let body: { u?: string; e?: string; exp?: number };
  try {
    body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!body.u || !body.e || typeof body.exp !== "number") return null;
  if (Date.now() > body.exp) return null;
  return { userId: body.u, email: body.e };
}

export type VerifyOutcome = "verified" | "already" | "mismatch" | "invalid";

/**
 * Consume a verification token: set `emailVerifiedAt` when the token is valid
 * and the account's current, real email still matches. Idempotent.
 */
export async function markEmailVerifiedFromToken(token: string): Promise<VerifyOutcome> {
  const decoded = verifyEmailVerifyToken(token);
  if (!decoded) return "invalid";
  if (!isRealEmail(decoded.email)) return "mismatch";

  const rows = await db
    .select({ id: users.id, email: users.email, verifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, decoded.userId))
    .limit(1);
  const row = rows[0];
  if (!row || row.email.trim().toLowerCase() !== decoded.email) return "mismatch";
  if (row.verifiedAt) return "already";

  await db.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, row.id));
  return "verified";
}

/** The email + verification state for the account page. */
export async function getUserEmailState(
  userId: string,
): Promise<{ email: string; verified: boolean; isReal: boolean }> {
  const rows = await db
    .select({ email: users.email, verifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const email = rows[0]?.email ?? "";
  return { email, verified: Boolean(rows[0]?.verifiedAt), isReal: isRealEmail(email) };
}
