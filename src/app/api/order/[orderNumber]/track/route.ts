import { and, eq } from "drizzle-orm";

import { ApiError, ok, route } from "@/server/api/http";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { orders } from "@/server/db/schema";
import { refreshOrderTracking } from "@/server/delivery/tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Refresh courier tracking for the signed-in customer's own order. */
export const POST = route(
  async (_request: Request, context: RouteContext<"/api/order/[orderNumber]/track">) => {
    const user = await getCurrentUser();
    if (!user) throw new ApiError("UNAUTHORIZED", "Please sign in.");

    const { orderNumber } = await context.params;
    const [order] = await db
      .select({ id: orders.id, delhiveryAwb: orders.delhiveryAwb })
      .from(orders)
      .where(and(eq(orders.orderNumber, orderNumber), eq(orders.userId, user.id)))
      .limit(1);

    if (!order) throw new ApiError("NOT_FOUND", "That order does not exist.");

    const result = await refreshOrderTracking(order);
    return ok({
      // Null when there is no live update yet — the UI shows an honest message.
      status: result?.status ?? null,
      detail: result?.statusDetail ?? null,
      location: result?.location ?? null,
      updatedAt: result?.updatedAt ?? null,
    });
  },
);
