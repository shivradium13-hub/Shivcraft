import { ok, route } from "@/server/api/http";
import { getBrowseTree } from "@/server/catalog/browse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/categories — the whole active tree, in admin order, with counts. */
export const GET = route(async () => {
  return ok({ categories: await getBrowseTree() });
});
