import { createHash, randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";

import { forgotPasswordSchema } from "@/lib/validation";
import { ApiError, ok, readJson, route } from "@/server/api/http";
import { emailConfigured, sendEmail } from "@/server/notify/channels";
import { clientIp, rateLimit } from "@/server/security/rateLimit";
import { db } from "@/server/db";
import { passwordResetTokens, users } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");
const RESET_TTL_MIN = 60;

function resetEmailHtml(name: string, url: string): string {
  const safeName = name.replace(/[<>&]/g, "");
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;color:#111827">
    <p style="font-size:18px;font-weight:bold;color:#e5541a;margin:0 0 16px">SHIV RADIUM</p>
    <p style="font-size:15px">Hi ${safeName || "there"},</p>
    <p style="font-size:14px;line-height:1.6">We received a request to reset your Shiv Radium password. Tap the button below to set a new one. This link works once and expires in ${RESET_TTL_MIN} minutes.</p>
    <p style="margin:24px 0"><a href="${url}" style="background:#e5541a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:14px;font-weight:bold;display:inline-block">Reset my password</a></p>
    <p style="font-size:12px;color:#6b7280;line-height:1.6">If the button doesn't work, copy this link into your browser:<br>${url}</p>
    <p style="font-size:12px;color:#6b7280;line-height:1.6">If you didn't request this, you can safely ignore this email — your password stays the same.</p>
  </div>`;
}

/**
 * Start a password reset. Always answers the same way whether or not the email
 * is registered (no account enumeration). Needs an email provider configured;
 * that is a shop-wide state, not user-specific, so saying so leaks nothing.
 */
export const POST = route(async (request: Request) => {
  await rateLimit(
    `forgot:ip:${clientIp(request)}`,
    10,
    3600,
    "Too many requests. Please try again later.",
  );

  const input = await readJson(request, forgotPasswordSchema);

  if (!emailConfigured()) {
    throw new ApiError(
      "BAD_REQUEST",
      "Password reset by email isn't set up yet. Please contact support and we'll reset it for you.",
    );
  }

  await rateLimit(
    `forgot:email:${input.email}`,
    5,
    3600,
    "Too many reset requests for this email. Please try again later.",
  );

  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(sql`lower(${users.email}) = ${input.email}`)
    .limit(1);

  // Clear expired tokens left behind by abandoned requests (no TTL otherwise).
  await db.execute(sql`DELETE FROM password_reset_tokens WHERE expires_at < now()`);

  if (user) {
    // One active token per user.
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));

    const token = randomBytes(32).toString("base64url");
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MIN * 60 * 1000),
    });

    const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://shivradium.com").replace(/\/+$/, "");
    const url = `${base}/reset-password?token=${token}`;
    await sendEmail(user.email, "Reset your Shiv Radium password", resetEmailHtml(user.name, url));
  }

  return ok({ sent: true });
});
