import { z } from "zod";

import { normalisePhone10 } from "@/lib/whatsapp";
import { ApiError, ok, readJson, route } from "@/server/api/http";
import { findOrCreateUserByPhone, verifyOtp } from "@/server/auth/otp";
import { createSession } from "@/server/auth/session";
import { mergeGuestCart } from "@/server/cart/merge";
import { clientIp, rateLimit } from "@/server/security/rateLimit";
import { getWhatsappSettings } from "@/server/whatsapp/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  phone: z.string().min(8).max(20),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code."),
});

/**
 * POST /api/auth/otp/verify — check the code and sign the customer in, creating
 * the account on first login. The code is validated only here on the server.
 */
export const POST = route(async (request: Request) => {
  await rateLimit(`otp:verify:ip:${clientIp(request)}`, 30, 600, "Too many attempts. Please wait a few minutes.");

  const input = await readJson(request, schema);
  const phone = normalisePhone10(input.phone);
  if (phone.length !== 10) throw new ApiError("BAD_REQUEST", "Enter a valid mobile number.");
  await rateLimit(
    `otp:verify:phone:${phone}`,
    10,
    600,
    "Too many attempts for this number. Please wait a few minutes.",
  );

  const settings = await getWhatsappSettings();
  if (!settings.otpEnabled) throw new ApiError("FORBIDDEN", "WhatsApp login isn’t available right now.");

  const result = await verifyOtp(phone, input.code, settings.otpMaxAttempts);
  if (!result.ok) {
    const msg =
      result.reason === "expired"
        ? "That code has expired. Please request a new one."
        : result.reason === "too_many"
          ? "Too many wrong attempts. Please request a new code."
          : result.reason === "no_code"
            ? "Please request a code first."
            : "That code is not right. Please try again.";
    throw new ApiError("UNAUTHORIZED", msg);
  }

  const account = await findOrCreateUserByPhone(phone);
  await createSession(account.id, request.headers.get("user-agent"));
  await mergeGuestCart(account.id);

  return ok({
    user: {
      id: account.id,
      name: account.name,
      email: account.email,
      phone: account.phone,
      role: account.role,
    },
    created: account.created,
  });
});
