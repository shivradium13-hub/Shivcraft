import { ApiError, ok, route } from "@/server/api/http";
import { createEmailVerifyToken, EMAIL_VERIFY_TTL_MINUTES, getUserEmailState } from "@/server/auth/emailVerify";
import { requireUser } from "@/server/auth/guards";
import { getEmailSettings } from "@/server/email/settings";
import { sendVerificationEmail } from "@/server/email/service";
import { clientIp, rateLimit } from "@/server/security/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/email/request — the signed-in customer asks us to send a
 * verification link to their own account email. Mock-first: while email is not
 * live nothing is delivered, and in dev the link is echoed back so the flow is
 * testable. The verification link is never returned in production.
 */
export const POST = route(async (request: Request) => {
  const user = await requireUser();
  await rateLimit(`emailverify:ip:${clientIp(request)}`, 20, 600, "Too many requests. Please wait a few minutes.");
  await rateLimit(`emailverify:user:${user.id}`, 5, 600, "Too many verification emails requested. Please wait a few minutes.");

  const state = await getUserEmailState(user.id);
  if (!state.isReal) {
    throw new ApiError("BAD_REQUEST", "There isn't an email address on this account to verify.");
  }
  if (state.verified) {
    return ok({ alreadyVerified: true, sent: false, mock: false });
  }

  const settings = await getEmailSettings();
  const token = createEmailVerifyToken(user.id, state.email);
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(/\/+$/, "");
  const link = `${origin}/verify-email?token=${encodeURIComponent(token)}`;

  const result = await sendVerificationEmail({ to: state.email, link, settings, ttlMinutes: EMAIL_VERIFY_TTL_MINUTES });
  const devLink = process.env.NODE_ENV !== "production" ? link : undefined;

  return ok({
    sent: result.ok && !result.mock,
    mock: result.mock,
    ttlMinutes: EMAIL_VERIFY_TTL_MINUTES,
    ...(devLink ? { devLink } : {}),
  });
});
