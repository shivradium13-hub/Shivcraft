import { eq } from "drizzle-orm";

import { ApiError, ok, route } from "@/server/api/http";
import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db";
import { orders } from "@/server/db/schema";
import { refreshOrderTracking } from "@/server/delivery/tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin pulls the latest Delhivery status for an order and stores it. */
export const POST = route(
  async (
    _request: Request,
    context: RouteContext<"/api/admin/orders/[orderNumber]/delhivery/track">,
  ) => {
    await requireAdmin();
    const { orderNumber } = await context.params;

    const [order] = await db
      .select({ id: orders.id, delhiveryAwb: orders.delhiveryAwb })
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);

    if (!order) throw new ApiError("NOT_FOUND", "That order does not exist.");

    const result = await refreshOrderTracking(order);
    return ok({
      status: result?.status ?? null,
      detail: result?.statusDetail ?? null,
      location: result?.location ?? null,
      updatedAt: result?.updatedAt ?? null,
    });
  },
);
