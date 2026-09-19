import { and, eq, ne, sql } from "drizzle-orm";

import { couponSchema } from "@/lib/adminValidation";
import { ApiError, ok, readJson, route } from "@/server/api/http";
import { assertCouponDeletable, toCouponRow } from "@/server/admin/promos";
import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db";
import { coupons } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route(
  async (request: Request, context: RouteContext<"/api/admin/coupons/[id]">) => {
    await requireAdmin();
    const { id } = await context.params;
    const input = await readJson(request, couponSchema);

    const existing = await db
      .select({ id: coupons.id })
      .from(coupons)
      .where(eq(coupons.id, id))
      .limit(1);

    if (!existing[0]) throw new ApiError("NOT_FOUND", "That coupon does not exist.");

    const clash = await db
      .select({ id: coupons.id })
      .from(coupons)
      .where(and(sql`upper(${coupons.code}) = ${input.code}`, ne(coupons.id, id)))
      .limit(1);

    if (clash[0]) {
      throw new ApiError("CONFLICT", `A coupon with the code “${input.code}” already exists.`);
    }

    /* usedCount is deliberately not in the patch: it belongs to the order path,
       and letting an edit reset it would hand out an exhausted coupon again. */
    const [row] = await db
      .update(coupons)
      .set(toCouponRow(input))
      .where(eq(coupons.id, id))
      .returning();

    return ok({ coupon: row });
  },
);

export const DELETE = route(
  async (_request: Request, context: RouteContext<"/api/admin/coupons/[id]">) => {
    await requireAdmin();
    const { id } = await context.params;

    const existing = await db
      .select({ id: coupons.id, code: coupons.code })
      .from(coupons)
      .where(eq(coupons.id, id))
      .limit(1);

    if (!existing[0]) throw new ApiError("NOT_FOUND", "That coupon does not exist.");

    // Refuses when redemptions would be cascaded away with it.
    await assertCouponDeletable(id);

    await db.delete(coupons).where(eq(coupons.id, id));
    return ok({ deleted: true, code: existing[0].code });
  },
);
