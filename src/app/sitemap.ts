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
  ];

  try {
    const [prod, cats] = await Promise.all([
      db
        .select({ slug: products.slug, updatedAt: products.updatedAt })
        .from(products)
        .where(eq(products.isActive, true)),
      db.select({ slug: categories.slug }).from(categories),
    ]);

    const categoryRoutes: MetadataRoute.Sitemap = cats.map((c) => ({
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
