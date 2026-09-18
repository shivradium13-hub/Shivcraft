import { ApiError, ok, route } from "@/server/api/http";
import { getBrowseTree } from "@/server/catalog/browse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/categories/:slug/subcategories */
export const GET = route(
  async (_request: Request, context: RouteContext<"/api/categories/[slug]/subcategories">) => {
    const { slug } = await context.params;
    const tree = await getBrowseTree();
    const category = tree.find((c) => c.slug === slug);

    if (!category) throw new ApiError("NOT_FOUND", "That category does not exist.");
    return ok({ subcategories: category.subcategories });
  },
);
