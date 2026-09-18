import { and, desc, eq } from "drizzle-orm";

import { addressSchema } from "@/lib/validation";
import { created, ok, readJson, route } from "@/server/api/http";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { addresses } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/addresses — this user's saved addresses, default first. */
export const GET = route(async () => {
  const user = await requireUser();
  const rows = await db
    .select()
    .from(addresses)
    .where(eq(addresses.userId, user.id))
    .orderBy(desc(addresses.isDefault), desc(addresses.createdAt));
  return ok({ addresses: rows });
});

/** POST /api/addresses */
export const POST = route(async (request: Request) => {
  const user = await requireUser();
  const input = await readJson(request, addressSchema);

  // Only one default at a time, or the checkout preselect becomes arbitrary.
  if (input.isDefault) {
    await db
      .update(addresses)
      .set({ isDefault: false })
      .where(and(eq(addresses.userId, user.id), eq(addresses.isDefault, true)));
  }

  const existing = await db
    .select({ id: addresses.id })
    .from(addresses)
    .where(eq(addresses.userId, user.id));

  const [row] = await db
    .insert(addresses)
    .values({
      userId: user.id,
      fullName: input.fullName,
      phone: input.phone,
      line1: input.line1,
      line2: input.line2 || null,
      area: input.area || null,
      city: input.city,
      state: input.state,
      pincode: input.pincode,
      // The first address a customer saves is their default automatically.
      isDefault: input.isDefault || existing.length === 0,
    })
    .returning();

  return created({ address: row });
});
