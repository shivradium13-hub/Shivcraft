import { z } from "zod";

import { ok, readJson, route } from "@/server/api/http";
import { requireUser } from "@/server/auth/guards";
import { deleteReview, updateOwnReview } from "@/server/reviews/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  rating: z.number().int().min(1, "Pick a rating.").max(5),
  title: z.string().trim().max(160).optional().or(z.literal("")),
  body: z.string().trim().max(3000).optional().or(z.literal("")),
});

export const PATCH = route(
  async (request: Request, context: RouteContext<"/api/reviews/[id]">) => {
    const user = await requireUser();
    const { id } = await context.params;
    const input = await readJson(request, schema);

    return ok({
      review: await updateOwnReview(id, user.id, {
        rating: input.rating,
        title: input.title || undefined,
        body: input.body || undefined,
      }),
    });
  },
);

export const DELETE = route(
  async (_request: Request, context: RouteContext<"/api/reviews/[id]">) => {
    const user = await requireUser();
    const { id } = await context.params;
    // userId is passed, so this can only ever remove the caller's own review.
    return ok(await deleteReview(id, { userId: user.id }));
  },
);
