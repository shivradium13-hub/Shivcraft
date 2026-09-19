import { reviewSchema } from "@/lib/validation";
import { created, ok, readJson, route } from "@/server/api/http";
import { requireUser } from "@/server/auth/guards";
import { checkEligibility, createReview } from "@/server/reviews/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/reviews?productId=... — may this customer review it? */
export const GET = route(async (request: Request) => {
  const user = await requireUser();
  const productId = new URL(request.url).searchParams.get("productId") ?? "";
  return ok(await checkEligibility(user.id, productId));
});

export const POST = route(async (request: Request) => {
  const user = await requireUser();
  const input = await readJson(request, reviewSchema);

  const review = await createReview({
    userId: user.id,
    productId: input.productId,
    rating: input.rating,
    title: input.title || undefined,
    body: input.body || undefined,
  });

  return created({ review });
});
