import { productQuerySchema } from "@/lib/validation";
import { ok, readPaging, route } from "@/server/api/http";
import { findProducts } from "@/server/catalog/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (request: Request) => {
  const url = new URL(request.url);
  const query = productQuerySchema.parse(Object.fromEntries(url.searchParams));
  const paging = readPaging(url);

  const { items, total } = await findProducts(query, paging);

  return ok({
    items,
    page: paging.page,
    limit: paging.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / paging.limit)),
  });
});
