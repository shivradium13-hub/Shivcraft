/**
 * Automated tests for the email-verification flow and that it gates the email
 * OTP channel. Run with:  pnpm test:email-verify
 *
 * Runs in MOCK mode (EMAIL_LIVE never set) — no real email, no Brevo call. Uses
 * a throwaway user, cleaned up at the end. Exits non-zero on failure.
 */
import { createHmac } from "node:crypto";

import { eq, inArray } from "drizzle-orm";

// Known secret + dummy key BEFORE importing anything that reads them.
process.env.EMAIL_VERIFY_SECRET = "test-verify-secret";
process.env.BREVO_API_KEY = "test-brevo-key-DUMMY";
delete process.env.EMAIL_LIVE;

import { DEFAULT_EMAIL, type EmailSettings } from "@/lib/email";
import { DEFAULT_WHATSAPP, type WhatsappSettings } from "@/lib/whatsapp";
import {
  createEmailVerifyToken,
  getUserEmailState,
  markEmailVerifiedFromToken,
  verifyEmailVerifyToken,
} from "@/server/auth/emailVerify";
import { hashPassword } from "@/server/auth/password";
import { issueOtp } from "@/server/auth/otp";
import { db } from "@/server/db";
import { otpCodes, users } from "@/server/db/schema";
import { sendVerificationEmail } from "@/server/email/service";

const PHONE = "9000005555";
const EMAIL = "verifyflow@example.com";

const WA: WhatsappSettings = { ...DEFAULT_WHATSAPP, enabled: false, otpEnabled: true };
const EMAIL_ON: EmailSettings = {
  ...DEFAULT_EMAIL,
  enabled: true,
  otpEnabled: true,
  senderEmail: "otp@sender.test",
  senderName: "Shiv Radium Test",
};

let failures = 0;
function check(name: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

/** Craft a correctly-signed token with arbitrary claims (for expiry/mismatch). */
function craft(body: object): string {
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = createHmac("sha256", "test-verify-secret").update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

async function cleanup() {
  await db.delete(otpCodes).where(eq(otpCodes.phone, PHONE));
  await db.delete(users).where(inArray(users.phone, [PHONE]));
}

async function main() {
  console.log("\nEmail verification tests (mock email)");

  // --- token signing / validation ------------------------------------------
  const good = createEmailVerifyToken("00000000-0000-0000-0000-000000000000", EMAIL);
  const decoded = verifyEmailVerifyToken(good);
  check("valid token round-trips", !!decoded && decoded.email === EMAIL);
  check("tampered signature is rejected", verifyEmailVerifyToken(good.slice(0, -1) + (good.at(-1) === "a" ? "b" : "a")) === null);
  check("garbage token is rejected", verifyEmailVerifyToken("not.a.token") === null);
  check("expired token is rejected", verifyEmailVerifyToken(craft({ u: "x", e: EMAIL, exp: Date.now() - 1000 })) === null);

  // sendVerificationEmail mock: mock success, no network.
  const realFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
    fetchCalls++;
    return realFetch(...args);
  }) as typeof fetch;
  const vSend = await sendVerificationEmail({ to: EMAIL, link: "https://x/verify-email?token=abc", settings: EMAIL_ON, ttlMinutes: 60 });
  globalThis.fetch = realFetch;
  check("mock verification email is a mock success", vSend.ok === true && vSend.mock === true);
  check("mock verification email makes no network call", fetchCalls === 0);

  // --- markEmailVerifiedFromToken against the DB ----------------------------
  await cleanup();
  const [u] = await db
    .insert(users)
    .values({ name: "Verify test", email: EMAIL, phone: PHONE, passwordHash: await hashPassword("x"), emailVerifiedAt: null })
    .returning({ id: users.id });

  const before = await getUserEmailState(u.id);
  check("seed user starts unverified", before.verified === false && before.isReal === true);

  // Before verifying, the email OTP channel must NOT fire.
  const otpBefore = await issueOtp(PHONE, WA, u.id, EMAIL_ON);
  check("email OTP NOT attempted before verification", otpBefore.channels.email.attempted === false);

  check("invalid token → invalid", (await markEmailVerifiedFromToken("bad.token")) === "invalid");
  check("synthetic email token → mismatch", (await markEmailVerifiedFromToken(craft({ u: u.id, e: `wa-${PHONE}@phone.shivradium.local`, exp: Date.now() + 60000 }))) === "mismatch");
  check("token for a different email → mismatch", (await markEmailVerifiedFromToken(craft({ u: u.id, e: "someone-else@example.com", exp: Date.now() + 60000 }))) === "mismatch");

  const realToken = createEmailVerifyToken(u.id, EMAIL);
  check("valid token → verified", (await markEmailVerifiedFromToken(realToken)) === "verified");
  check("user is now verified", (await getUserEmailState(u.id)).verified === true);
  check("re-using the token → already (idempotent)", (await markEmailVerifiedFromToken(realToken)) === "already");

  // After verifying, the email OTP channel fires (mock).
  const otpAfter = await issueOtp(PHONE, WA, u.id, EMAIL_ON);
  check(
    "email OTP attempted AFTER verification",
    otpAfter.channels.email.attempted === true && otpAfter.channels.email.attempted && otpAfter.channels.email.ok === true,
  );
  check("WhatsApp still works throughout", otpBefore.ok === true && otpAfter.ok === true);

  await cleanup();

  console.log(failures === 0 ? "\n✓ All email-verification tests passed\n" : `\n✗ ${failures} test(s) failed\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
