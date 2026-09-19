import { eq } from "drizzle-orm";
import { z } from "zod";

import { ApiError, ok, readJson, route } from "@/server/api/http";
import {
  assertRoleChangeAllowed,
  assertUserDeletable,
  revokeSessions,
} from "@/server/admin/users";
import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z
  .object({
    role: z.enum(["USER", "ADMIN"], { message: "Choose a role." }).optional(),
    isBlocked: z.boolean().optional(),
  })
  .refine((value) => value.role !== undefined || value.isBlocked !== undefined, {
    message: "Nothing to change.",
  });

export const PATCH = route(
  async (request: Request, context: RouteContext<"/api/admin/users/[id]">) => {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const input = await readJson(request, schema);

    // Refuses self-lockout and removing the last admin, before anything is written.
    await assertRoleChangeAllowed(admin.id, id, input);

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.role !== undefined) patch.role = input.role;
    if (input.isBlocked !== undefined) patch.isBlocked = input.isBlocked;

    const [row] = await db
      .update(users)
      .set(patch)
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        isBlocked: users.isBlocked,
      });

    if (!row) throw new ApiError("NOT_FOUND", "That account does not exist.");

    /* getCurrentUser already refuses a blocked account, so the block bites on
       the next request either way. Dropping the rows makes that explicit and
       stops a blocked session lingering in the sessions table. Demotion
       revokes too: an open admin tab should not keep working. */
    if (input.isBlocked === true || input.role === "USER") {
      await revokeSessions(id);
    }

    return ok({ user: row });
  },
);

export const DELETE = route(
  async (_request: Request, context: RouteContext<"/api/admin/users/[id]">) => {
    const admin = await requireAdmin();
    const { id } = await context.params;

    if (admin.id === id) {
      throw new ApiError("BAD_REQUEST", "You cannot delete the account you are signed in with.");
    }

    const existing = await db
      .select({ id: users.id, name: users.name, role: users.role, isBlocked: users.isBlocked })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!existing[0]) throw new ApiError("NOT_FOUND", "That account does not exist.");

    // Deleting an admin is a role change too — the last-admin rule still applies.
    await assertRoleChangeAllowed(admin.id, id, { role: "USER" });
    await assertUserDeletable(id);

    await db.delete(users).where(eq(users.id, id));
    return ok({ deleted: true, name: existing[0].name });
  },
);
