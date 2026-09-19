import { and, eq, sql } from "drizzle-orm";

import { addressSchema } from "@/lib/validation";
import { ApiError, ok, readJson, route } from "@/server/api/http";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { addresses } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Only ever touches an address belonging to the caller. */
async function loadOwn(id: string, userId: string) {
  const rows = await db
    .select()
    .from(addresses)
    .where(and(eq(addresses.id, id), eq(addresses.userId, userId)))
    .limit(1);

  if (!rows[0]) throw new ApiError("NOT_FOUND", "That address could not be found.");
  return rows[0];
}

export const PATCH = route(
  async (request: Request, context: RouteContext<"/api/addresses/[id]">) => {
    const user = await requireUser();
    const { id } = await context.params;
    await loadOwn(id, user.id);

    const input = await readJson(request, addressSchema);

    if (input.isDefault) {
      await db
        .update(addresses)
        .set({ isDefault: false })
        .where(and(eq(addresses.userId, user.id), eq(addresses.isDefault, true)));
    }

    const [row] = await db
      .update(addresses)
      .set({
        fullName: input.fullName,
        phone: input.phone,
        line1: input.line1,
        line2: input.line2 || null,
        area: input.area || null,
        city: input.city,
        state: input.state,
        pincode: input.pincode,
        isDefault: input.isDefault ?? false,
      })
      .where(eq(addresses.id, id))
      .returning();

    return ok({ address: row });
  },
);

export const DELETE = route(
  async (_request: Request, context: RouteContext<"/api/addresses/[id]">) => {
    const user = await requireUser();
    const { id } = await context.params;
    const address = await loadOwn(id, user.id);

    await db.delete(addresses).where(eq(addresses.id, id));

    /* Orders copy the address at checkout, so deleting one never disturbs past
       deliveries. But the account should not be left with no default. */
    if (address.isDefault) {
      const remaining = await db
        .select({ id: addresses.id })
        .from(addresses)
        .where(eq(addresses.userId, user.id))
        .orderBy(sql`created_at DESC`)
        .limit(1);

      if (remaining[0]) {
        await db.update(addresses).set({ isDefault: true }).where(eq(addresses.id, remaining[0].id));
      }
    }

    return ok({ deleted: true });
  },
);
