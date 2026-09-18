import { productSchema } from "@/lib/adminValidation";
import { created, ok, readJson, readPaging, route } from "@/server/api/http";
import { createProduct, listAdminProducts } from "@/server/admin/products";
import { requireAdmin } from "@/server/auth/guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/products — includes disabled products, which the storefront
 *  endpoint deliberately hides. */
export const GET = route(async (request: Request) => {
  await requireAdmin();
  const url = new URL(request.url);
  const paging = readPaging(url, 20, 100);

  const stateParam = url.searchParams.get("state");
  const state =
    stateParam === "active" || stateParam === "disabled" || stateParam === "low"
      ? stateParam
      : "all";

  const { rows, total } = await listAdminProducts({
    query: url.searchParams.get("q")?.trim() || undefined,
    categoryId: url.searchParams.get("categoryId") || undefined,
    state,
    page: paging.page,
    limit: paging.limit,
  });

  return ok({
    items: rows,
    page: paging.page,
    total,
    totalPages: Math.max(1, Math.ceil(total / paging.limit)),
  });
});

/** POST /api/admin/products */
export const POST = route(async (request: Request) => {
  await requireAdmin();
  const input = await readJson(request, productSchema);
  const row = await createProduct(input);
  return created({ product: row });
});
