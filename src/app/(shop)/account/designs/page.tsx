import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";

import { designSchema } from "@/lib/customizer/design";
import { readConfig } from "@/lib/customizer/schema";
import { SavedDesignsList, type SavedDesignItem } from "@/components/shop/SavedDesignsList";
import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db";
import { products, savedDesigns } from "@/server/db/schema";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Saved designs", robots: { index: false, follow: false } };

export default async function SavedDesignsPage() {
  const user = await requireUser();

  const rows = await db
    .select({
      id: savedDesigns.id,
      name: savedDesigns.name,
      createdAt: savedDesigns.createdAt,
      configVersion: savedDesigns.configVersion,
      design: savedDesigns.design,
      productName: products.name,
      productSlug: products.slug,
      customizer: products.customizer,
    })
    .from(savedDesigns)
    .innerJoin(products, eq(products.id, savedDesigns.productId))
    .where(eq(savedDesigns.userId, user.id))
    .orderBy(desc(savedDesigns.createdAt));

  /* Config and design are parsed here, on the server, so the client list
     receives values it can render straight away and a row with unreadable data
     is simply dropped rather than breaking the page. */
  const items: SavedDesignItem[] = rows.flatMap((row) => {
    const parsed = designSchema.safeParse(row.design);
    if (!parsed.success) return [];
    const config = readConfig(row.customizer);
    return [
      {
        id: row.id,
        name: row.name,
        productName: row.productName,
        productSlug: row.productSlug,
        savedAt: row.createdAt.toISOString(),
        config,
        design: parsed.data,
        // The product was republished after this was saved, so the layout it
        // was built against may differ from the one it would open into.
        stale: config.enabled && config.version !== parsed.data.configVersion,
      },
    ];
  });

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Saved designs</h1>
      {/* The count and empty message live in the client list so they stay true
          after a delete or duplicate, rather than reflecting only page load. */}
      <SavedDesignsList initial={items} />
    </div>
  );
}
