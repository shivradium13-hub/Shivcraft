import { sql } from "drizzle-orm";

import { couponSchema } from "@/lib/adminValidation";
import { ApiError, created, ok, readJson, route } from "@/server/api/http";
import { listAdminCoupons, toCouponRow } from "@/server/admin/promos";
import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db";
import { coupons } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireAdmin();
  return ok({ coupons: await listAdminCoupons() });
});

export const POST = route(async (request: Request) => {
  await requireAdmin();
  const input = await readJson(request, couponSchema);

  // The unique index is on upper(code), so it cannot be an ON CONFLICT arbiter.
  const clash = await db
    .select({ id: coupons.id })
    .from(coupons)
    .where(sql`upper(${coupons.code}) = ${input.code}`)
    .limit(1);

  if (clash[0]) {
    throw new ApiError("CONFLICT", `A coupon with the code “${input.code}” already exists.`);
  }

  const [row] = await db.insert(coupons).values(toCouponRow(input)).returning();
  return created({ coupon: row });
});
