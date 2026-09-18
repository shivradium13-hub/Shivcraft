import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { CheckoutClient } from "@/components/shop/CheckoutClient";
import { getCurrentUser } from "@/server/auth/session";
import { getCartView } from "@/server/cart/queries";
import { db } from "@/server/db";
import { addresses } from "@/server/db/schema";
import { isRazorpayConfigured } from "@/server/payments/razorpay";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  // Orders belong to an account, so this is the point where signing in is
  // required. The guest cart is merged onto the account at login.
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/checkout");

  const cart = await getCartView({ user, guestToken: null });
  if (cart.items.length === 0) redirect("/cart");

  const saved = await db
    .select()
    .from(addresses)
    .where(eq(addresses.userId, user.id))
    .orderBy(desc(addresses.isDefault), desc(addresses.createdAt));

  return (
    <div>
      <h1 className="mb-5 font-display text-2xl font-semibold text-ink sm:text-3xl">Checkout</h1>
      <CheckoutClient
        cart={cart}
        addresses={saved}
        customer={{ name: user.name, email: user.email, phone: user.phone }}
        onlineEnabled={isRazorpayConfigured()}
      />
    </div>
  );
}
