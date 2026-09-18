import { ok, route } from "@/server/api/http";
import { getCategoryTree } from "@/server/catalog/categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Client-side consumers of the tree (mobile drawer, admin pickers).
 *  Server Components call getCategoryTree() directly instead. */
export const GET = route(async () => {
  return ok({ categories: await getCategoryTree() });
});
