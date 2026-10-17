import { z } from "zod";

import { normalisePhone10 } from "@/lib/whatsapp";
import { ApiError, ok, readJson, route } from "@/server/api/http";
import { issueOtp } from "@/server/auth/otp";
import { clientIp, rateLimit } from "@/server/security/rateLimit";
import { getWhatsappSettings } from "@/server/whatsapp/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ phone: z.string().min(8).max(20) });

/**
 * POST /api/auth/otp/send — start WhatsApp login. Always responds the same way
 * whether or not the number is registered (no account enumeration). The OTP is
 * never returned in production; in dev it is echoed back so the flow is testable
 * while real delivery is mocked.
 */
export const POST = route(async (request: Request) => {
  await rateLimit(`otp:send:ip:${clientIp(request)}`, 20, 600, "Too many requests. Please wait a few minutes.");

  const input = await readJson(request, schema);
  const phone = normalisePhone10(input.phone);
  if (phone.length !== 10) {
    throw new ApiError("BAD_REQUEST", "Enter a valid 10-digit mobile number.", {
      phone: "Enter a valid 10-digit mobile number.",
    });
  }
  await rateLimit(
    `otp:send:phone:${phone}`,
    5,
    600,
    "Too many codes requested for this number. Please wait a few minutes.",
  );

  const settings = await getWhatsappSettings();
  if (!settings.otpEnabled) {
    throw new ApiError("FORBIDDEN", "WhatsApp login isn’t available right now. Please sign in with your password.");
  }

  const issued = await issueOtp(phone, settings);
  const devCode = process.env.NODE_ENV !== "production" ? issued.code : undefined;

  return ok({
    sent: true,
    mock: issued.mock,
    ttlMinutes: settings.otpTtlMinutes,
    resendSeconds: settings.otpResendSeconds,
    ...(devCode ? { devCode } : {}),
  });
});
