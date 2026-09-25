/**
 * Storefront layout controls — what the admin can show, hide, reorder and edit
 * on the homepage and product page, without touching code.
 *
 * Pure module (no database), so both the server pages that read the config and
 * the admin form that edits it can import the same types, defaults and
 * normaliser. The reader in `src/server/settings/storefront.ts` fetches the row
 * and runs `normaliseStorefront` so a page never has to trust a stored shape.
 *
 * Only sections and features that actually exist on those pages appear here — a
 * toggle with nothing behind it would be a control that does nothing.
 */

export type HomeSectionId =
  | "categories"
  | "trending"
  | "offers"
  | "bestSellers"
  | "personalised"
  | "promises"
  | "testimonials";

export type HomeSection = { id: HomeSectionId; enabled: boolean };

export type ProductFeatureId =
  | "description"
  | "specs"
  | "offers"
  | "delivery"
  | "reviews"
  | "related";

export type Promise_ = { title: string; body: string };

export type StorefrontSettings = {
  /** Homepage blocks in render order, each with a visibility flag. */
  home: HomeSection[];
  /** Product-page blocks: shown when true. */
  product: Record<ProductFeatureId, boolean>;
  /** The "Why choose us" cards. Editable text; empty list hides the block. */
  promises: Promise_[];
};

/** Labels for the admin UI, and the canonical order the homepage ships with. */
export const HOME_SECTION_META: { id: HomeSectionId; label: string; hint: string }[] = [
  { id: "categories", label: "Shop by category", hint: "The category slider." },
  { id: "trending", label: "Trending right now", hint: "Products marked trending." },
  { id: "offers", label: "Offer banners", hint: "Promotional offer cards." },
  { id: "bestSellers", label: "Best sellers", hint: "Products marked best seller." },
  { id: "personalised", label: "Personalised gifts", hint: "The 4-step personalisation band." },
  { id: "promises", label: "Why choose us", hint: "The promise / USP cards below." },
  { id: "testimonials", label: "Customer reviews", hint: "Approved reviews across the shop." },
];

export const PRODUCT_FEATURE_META: { id: ProductFeatureId; label: string; hint: string }[] = [
  { id: "description", label: "About this product", hint: "The long description." },
  { id: "specs", label: "Specifications", hint: "Material, size, SKU and so on." },
  { id: "offers", label: "Available offers", hint: "Live coupons for this category." },
  { id: "delivery", label: "PIN-code delivery check", hint: "The deliverability estimate." },
  { id: "reviews", label: "Ratings & reviews", hint: "The review form and list." },
  { id: "related", label: "You may also like", hint: "Related products rail." },
];

const HOME_IDS = HOME_SECTION_META.map((s) => s.id);
const PRODUCT_IDS = PRODUCT_FEATURE_META.map((f) => f.id);

export const DEFAULT_PROMISES: Promise_[] = [
  { title: "Premium quality", body: "Seasoned wood, SS304 and 3 mm acrylic — never thin board." },
  { title: "Personalised", body: "Your photo, your names, your spelling. Proof before we cut." },
  { title: "Secure payments", body: "UPI, cards, net banking, wallets and cash on delivery." },
  { title: "Fast delivery", body: "Dispatched in 3–5 working days, tracked pan-India." },
  { title: "Easy ordering", body: "Pick, personalise, pay. Reorder a past gift in two taps." },
  { title: "Real support", body: "Talk to the workshop, not a script. Mon–Sat, 10–8." },
];

export const DEFAULT_STOREFRONT: StorefrontSettings = {
  home: HOME_IDS.map((id) => ({ id, enabled: true })),
  product: Object.fromEntries(PRODUCT_IDS.map((id) => [id, true])) as Record<ProductFeatureId, boolean>,
  promises: DEFAULT_PROMISES,
};

export const MAX_PROMISES = 9;

type Raw = Record<string, unknown>;

/**
 * Turns whatever is stored (or nothing) into a complete, valid config.
 *
 * Home sections keep the admin's saved order, drop any unknown id, and append
 * any section that exists in code but is missing from the saved list (enabled),
 * so shipping a new homepage block never makes it invisible. Product features
 * fall back to shown. Promises are trimmed and bounded; an all-empty list falls
 * back to the defaults so the block is never accidentally blanked to nothing by
 * a bad write, while deliberately hiding it is done with the home toggle.
 */
export function normaliseStorefront(raw: unknown): StorefrontSettings {
  const value = (raw ?? {}) as Raw;

  const savedHome = Array.isArray(value.home) ? (value.home as Raw[]) : [];
  const seen = new Set<HomeSectionId>();
  const home: HomeSection[] = [];
  for (const entry of savedHome) {
    const id = entry?.id as HomeSectionId;
    if (!HOME_IDS.includes(id) || seen.has(id)) continue;
    seen.add(id);
    home.push({ id, enabled: entry?.enabled !== false });
  }
  for (const id of HOME_IDS) {
    if (!seen.has(id)) home.push({ id, enabled: true });
  }

  const savedProduct = (value.product ?? {}) as Raw;
  const product = Object.fromEntries(
    PRODUCT_IDS.map((id) => [id, savedProduct[id] !== false]),
  ) as Record<ProductFeatureId, boolean>;

  const savedPromises = Array.isArray(value.promises) ? (value.promises as Raw[]) : null;
  let promises: Promise_[] = DEFAULT_PROMISES;
  if (savedPromises) {
    const cleaned = savedPromises
      .map((p) => ({
        title: String(p?.title ?? "").trim().slice(0, 80),
        body: String(p?.body ?? "").trim().slice(0, 240),
      }))
      .filter((p) => p.title || p.body)
      .slice(0, MAX_PROMISES);
    if (cleaned.length > 0) promises = cleaned;
  }

  return { home, product, promises };
}
