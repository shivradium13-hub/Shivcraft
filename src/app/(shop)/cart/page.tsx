import type { Metadata } from "next";

import { CartClient } from "@/components/shop/CartClient";
import { getCartView } from "@/server/cart/queries";
import { readShopper } from "@/server/shop/identity";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your cart",
  robots: { index: false, follow: false },
};

export default async function CartPage() {
  const shopper = await readShopper();
  const cart = await getCartView(shopper);

  return (
    <div>
      <h1 className="mb-5 font-display text-2xl font-semibold text-ink sm:text-3xl">Your cart</h1>
      <CartClient initial={cart} />
    </div>
  );
}
