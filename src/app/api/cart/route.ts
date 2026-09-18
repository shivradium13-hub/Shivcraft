import { ok, route } from "@/server/api/http";
import { getCartView } from "@/server/cart/queries";
import { readShopper } from "@/server/shop/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/cart — the whole cart, priced and validated server-side. */
export const GET = route(async () => {
  const shopper = await readShopper();
  return ok(await getCartView(shopper));
});
