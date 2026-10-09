import { createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";

import { resetPasswordSchema } from "@/lib/validation";
import { ApiError, ok, readJson, route } from "@/server/api/http";
import { hashPassword } from "@/server/auth/password";
import { destroyAllSessionsFor } from "@/server/auth/session";
import { clientIp, rateLimit } from "@/server/security/rateLimit";
import { db } from "@/server/db";
import { passwordResetTokens, users } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");

/**
 * Finish a password reset: verify the one-time token, set the new password,
 * burn every reset token for that user and log them out of all sessions.
 */
export const POST = route(async (request: Request) => {
  await rateLimit(
    `reset:ip:${clientIp(request)}`,
    20,
    3600,
    "Too many attempts. Please try again later.",
  );

  const input = await readJson(request, resetPasswordSchema);
  const hash = sha256(input.token.trim());

  const [row] = await db
    .select({ id: passwordResetTokens.id, userId: passwordResetTokens.userId })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, hash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) {
    throw new ApiError(
      "BAD_REQUEST",
      "This reset link is invalid or has expired. Please request a new one.",
    );
  }

  const newHash = await hashPassword(input.password);

  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(users.id, row.userId));
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, row.userId));
  });

  // Reset invalidates every existing login — they sign in fresh with the new one.
  await destroyAllSessionsFor(row.userId);

  return ok({ reset: true });
});
