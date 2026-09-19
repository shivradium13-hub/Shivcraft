import { z } from "zod";

import { ok, readJson, route } from "@/server/api/http";
import { requireAdmin } from "@/server/auth/guards";
import { deleteReview, setReviewStatus } from "@/server/reviews/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ status: z.enum(["APPROVED", "PENDING", "REJECTED"]) });

/** Moderation. Taking a review down also removes it from the product rating. */
export const POST = route(
  async (request: Request, context: RouteContext<"/api/admin/reviews/[id]">) => {
    await requireAdmin();
    const { id } = await context.params;
    const { status } = await readJson(request, schema);
    return ok(await setReviewStatus(id, status));
  },
);

export const DELETE = route(
  async (_request: Request, context: RouteContext<"/api/admin/reviews/[id]">) => {
    await requireAdmin();
    const { id } = await context.params;
    // No userId: an admin may remove anyone's review.
    return ok(await deleteReview(id, {}));
  },
);
