import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { categories, products } from "@/server/db/schema";

// Generated on request (not at build) so a Neon hiccup during a deploy can never
// fail the build, and the list always reflects the live catalogue.
export const dynamic = "force-dynamic";

const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://shivradium.com").replace(/\/+$/, "");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/categories`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/search`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/support`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/privacy-policy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/terms-and-conditions`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/data-deletion`, changeFrequency: "yearly", priority: 0.2 },
  ];

  try {
    const [prod, cats, withProducts] = await Promise.all([
      db
        .select({ slug: products.slug, updatedAt: products.updatedAt })
        .from(products)
        .where(eq(products.isActive, true)),
      db
        .select({ id: categories.id, parentId: categories.parentId, slug: categories.slug, isActive: categories.isActive })
        .from(categories),
      // Categories that DIRECTLY hold an active product.
      db.selectDistinct({ categoryId: products.categoryId }).from(products).where(eq(products.isActive, true)),
    ]);

    /* Only list a category when its page would actually show something — i.e. it,
       or one of its subcategories, has an active product. A category page shows
       its whole subtree (categoryIdsForSlug is recursive), so we mark every
       category that has a direct product and then walk UP to its ancestors. This
       keeps empty categories out of the sitemap, and (since only isActive ones
       are emitted) a disabled category never becomes a sitemap URL that 404s. */
    const parentOf = new Map(cats.map((c) => [c.id, c.parentId]));
    const nonEmpty = new Set<string>();
    for (const { categoryId } of withProducts) {
      let id: string | null = categoryId;
      const seen = new Set<string>();
      while (id && !seen.has(id)) {
        seen.add(id);
        nonEmpty.add(id);
        id = parentOf.get(id) ?? null;
      }
    }

    const categoryRoutes: MetadataRoute.Sitemap = cats
      .filter((c) => c.isActive && nonEmpty.has(c.id))
      .map((c) => ({
        url: `${base}/category/${c.slug}`,
        changeFrequency: "weekly",
        priority: 0.6,
      }));

    const productRoutes: MetadataRoute.Sitemap = prod.map((p) => ({
      url: `${base}/product/${p.slug}`,
      lastModified: p.updatedAt ?? undefined,
      changeFrequency: "weekly",
      priority: 0.8,
    }));

    return [...staticRoutes, ...categoryRoutes, ...productRoutes];
  } catch (error) {
    // A catalogue read failure must not take the sitemap down entirely.
    console.error("[sitemap] catalogue unavailable, serving static routes only:", error);
    return staticRoutes;
  }
}
