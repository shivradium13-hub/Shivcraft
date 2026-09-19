import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";

import { AddressBook } from "@/components/shop/AddressBook";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { addresses } from "@/server/db/schema";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Saved addresses", robots: { index: false, follow: false } };

export default async function AddressesPage() {
  const user = await requireUser();

  const saved = await db
    .select()
    .from(addresses)
    .where(eq(addresses.userId, user.id))
    .orderBy(desc(addresses.isDefault), desc(addresses.createdAt));

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Saved addresses</h1>
      <p className="mt-1 mb-5 max-w-prose text-sm text-muted">
        Editing an address here never changes where a past order went — each order keeps its own
        copy of the address it was sent to.
      </p>
      <AddressBook initial={saved} />
    </div>
  );
}
