import { eq } from "drizzle-orm";
import { z } from "zod";

import { ApiError, ok, readJson, route } from "@/server/api/http";
import { requireAdmin } from "@/server/auth/guards";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters.")
    .max(200, "That password is too long."),
});

/**
 * POST /api/admin/account/password — the signed-in admin changes their own
 * password. The current password is re-checked (so a borrowed session cannot
 * silently take over the login), and only the scrypt hash of the new password
 * is stored — never the plaintext.
 */
export const POST = route(async (request: Request) => {
  const admin = await requireAdmin();
  const { currentPassword, newPassword } = await readJson(request, schema);

  const rows = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, admin.id))
    .limit(1);
  const row = rows[0];
  if (!row?.passwordHash) {
    throw new ApiError("BAD_REQUEST", "No password is set for this account.");
  }

  const currentOk = await verifyPassword(currentPassword, row.passwordHash);
  if (!currentOk) {
    throw new ApiError("BAD_REQUEST", "Current password is incorrect.");
  }

  if (newPassword === currentPassword) {
    throw new ApiError("BAD_REQUEST", "Choose a password different from the current one.");
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword) })
    .where(eq(users.id, admin.id));

  return ok({ updated: true });
});
