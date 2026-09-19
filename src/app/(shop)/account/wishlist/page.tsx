import type { Metadata } from "next";

import { WishlistClient } from "@/components/shop/WishlistClient";
import { getMyWishlist } from "@/server/account/queries";
import { requireUser } from "@/server/auth/guards";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Wishlist", robots: { index: false, follow: false } };

export default async function WishlistPage() {
  const user = await requireUser();
  const items = await getMyWishlist(user.id);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Wishlist</h1>
      <p className="mt-1 mb-5 text-sm text-muted">
        {items.length === 0 ? "Nothing saved yet." : `${items.length} saved`}
      </p>
      <WishlistClient initial={items} />
    </div>
  );
}
