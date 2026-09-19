import { eq } from "drizzle-orm";
import { z } from "zod";

import { ApiError, ok, readJson, route } from "@/server/api/http";
import { requireUser } from "@/server/auth/guards";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { SESSION_COOKIE, createSession, destroyAllSessionsFor } from "@/server/auth/session";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z.string().min(8, "Use at least 8 characters.").max(200),
});

/**
 * Changing the password signs out every other device.
 *
 * If someone else knew the old password, letting their session survive the
 * change would defeat the point of changing it. The current device is given a
 * fresh session so the person doing it is not logged out of their own browser.
 */
export const POST = route(async (request: Request) => {
  const user = await requireUser();
  const input = await readJson(request, schema);

  const rows = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const stored = rows[0]?.passwordHash;
  if (!stored || !(await verifyPassword(input.currentPassword, stored))) {
    throw new ApiError("UNAUTHORIZED", "That is not your current password.", {
      currentPassword: "Incorrect password.",
    });
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(input.newPassword), updatedAt: new Date() })
    .where(eq(users.id, user.id));

  await destroyAllSessionsFor(user.id);
  await createSession(user.id, request.headers.get("user-agent"));

  return ok({ changed: true, cookie: SESSION_COOKIE });
});
