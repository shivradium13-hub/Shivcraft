import type { MetadataRoute } from "next";

const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://shivradium.com").replace(/\/+$/, "");

/**
 * robots.txt — let crawlers index the storefront, but keep private and
 * transactional areas out of the index. (Account, order and invoice pages also
 * set `robots: noindex` themselves and require a login, so this is belt-and-braces.)
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/account", "/invoice", "/order", "/checkout", "/cart", "/api/"],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
