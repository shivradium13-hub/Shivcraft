import { z } from "zod";

import { ApiError, ok, readJson, route } from "@/server/api/http";
import { markEmailVerifiedFromToken } from "@/server/auth/emailVerify";
import { clientIp, rateLimit } from "@/server/security/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ token: z.string().min(10).max(2000) });

/**
 * POST /api/auth/email/confirm — consume a verification link token. Public (the
 * signed token itself proves the request), rate-limited, and only verifies when
 * the token is valid and still matches the account's current email.
 */
export const POST = route(async (request: Request) => {
  await rateLimit(`emailconfirm:ip:${clientIp(request)}`, 30, 600, "Too many attempts. Please wait a few minutes.");
  const { token } = await readJson(request, schema);

  const outcome = await markEmailVerifiedFromToken(token);
  if (outcome === "invalid" || outcome === "mismatch") {
    throw new ApiError(
      "BAD_REQUEST",
      "This verification link is invalid or has expired. Please sign in and request a new one.",
    );
  }
  return ok({ verified: true, alreadyVerified: outcome === "already" });
});
