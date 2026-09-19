/**
 * Seeds the catalogue with realistic demo data.
 *
 * Run with:  pnpm db:seed
 *
 * Safe to re-run: it clears the catalogue tables first, but leaves real
 * customer accounts and orders alone unless --wipe is passed.
 */

import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { config } from "dotenv";
import { sql } from "drizzle-orm";

config({ path: ".env.local" });

import { db } from "./index";
import { hashPassword } from "../auth/password";
import {
  banners,
  categories,
  categoryCrossLinks,
  coupons,
  customizationFields,
  productImages,
  productVariants,
  products,
  reviews,
  settings,
  users,
} from "./schema";

const R = (rupees: number) => rupees * 100;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

/* ------------------------------------------------- placeholder imagery ---
 * The admin replaces these with real photographs through the product editor.
 * Generating them locally keeps the seed free of any external image host.   */

const SWATCHES: Record<string, [string, string, string]> = {
  nameplate: ["#8A6238", "#4A3220", "#E9DCC6"],
  frame: ["#26697A", "#173F4A", "#DDEBEE"],
  mug: ["#B4472E", "#6E2A1B", "#F6DED5"],
  craft: ["#5C6F3A", "#2F3A1D", "#E4EAD4"],
  gift: ["#8E3B6B", "#4E1F3A", "#F2DCEA"],
  hamper: ["#B07D2A", "#6B4A14", "#F3E7CC"],
};

function writePlaceholders(): void {
  const dir = join(process.cwd(), "public", "placeholders");
  mkdirSync(dir, { recursive: true });

  for (const [key, [mid, dark, light]] of Object.entries(SWATCHES)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" role="img" aria-label="${key} placeholder">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${light}"/>
      <stop offset="1" stop-color="${mid}" stop-opacity="0.55"/>
    </linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#g)"/>
  <rect x="150" y="150" width="500" height="500" rx="18" fill="none" stroke="${dark}" stroke-opacity="0.35" stroke-width="3"/>
  <rect x="210" y="210" width="380" height="380" rx="10" fill="${mid}" fill-opacity="0.22"/>
  <circle cx="400" cy="372" r="86" fill="${dark}" fill-opacity="0.18"/>
  <text x="400" y="640" font-family="Georgia, serif" font-size="34" letter-spacing="2" fill="${dark}" fill-opacity="0.6" text-anchor="middle">SHIV RADIUM</text>
</svg>`;
    writeFileSync(join(dir, `${key}.svg`), svg, "utf8");
  }
}

/* ------------------------------------------------------------ categories */

type CatSeed = { name: string; icon: string; art: keyof typeof SWATCHES; home?: boolean; children: string[] };

/**
 * Each subcategory is created exactly once, under its canonical parent.
 * Where it also belongs somewhere else it is cross-linked (see CROSS_LINKS)
 * rather than duplicated, so one slug owns the products and the count.
 */
const CATEGORY_TREE: CatSeed[] = [
  {
    name: "Name Plates",
    icon: "🪧",
    art: "nameplate",
    home: true,
    children: [
      "Wooden Name Plates",
      "Acrylic Name Plates",
      "LED Name Plates",
      "Door Name Plates",
      "Custom Name Plates",
      "3D Name Plates",
      "Premium Name Plates",
    ],
  },
  {
    name: "Photo Frames",
    icon: "🖼",
    art: "frame",
    home: true,
    children: [
      "Single Photo Frames",
      "Collage Frames",
      "Couple Frames",
      "Family Frames",
      "LED Photo Frames",
      "Wooden Photo Frames",
      "Acrylic Photo Frames",
      "Anniversary Frames",
    ],
  },
  {
    name: "Photo Mugs",
    icon: "☕",
    art: "mug",
    home: true,
    children: [
      "Personalized Photo Mugs",
      "Couple Mugs",
      "Birthday Mugs",
      "Magic Mugs",
      "Printed Mugs",
      "Anniversary Mugs",
    ],
  },
  {
    name: "Handmade Crafts",
    icon: "🎨",
    art: "craft",
    home: true,
    // Your list repeats "Handmade Crafts" as a child of itself; kept as the
    // parent only, since a child with the same slug cannot exist.
    children: [
      "Wall Decor",
      "Decorative Showpieces",
      "Handmade Flowers",
      "Wooden Crafts",
      "Resin Crafts",
    ],
  },
  {
    name: "Birthday Gifts",
    icon: "🎂",
    art: "hamper",
    home: true,
    children: [
      "Birthday Hampers",
      "Personalized Birthday Gifts",
      "Birthday Frames",
      "Birthday Name Plates",
      "Kids Birthday Gifts",
    ],
  },
  {
    name: "Anniversary Gifts",
    icon: "💍",
    art: "gift",
    home: true,
    children: ["Personalized Anniversary Gifts"],
  },
  {
    name: "Couple Gifts",
    icon: "❤️",
    art: "gift",
    home: true,
    children: ["Couple Name Plates", "Personalized Couple Gifts", "Romantic Gifts"],
  },
  {
    name: "Wedding Gifts",
    icon: "💒",
    art: "hamper",
    home: true,
    children: [
      "Wedding Frames",
      "Wedding Name Plates",
      "Wedding Hampers",
      "Personalized Wedding Gifts",
    ],
  },
  {
    name: "Home Decoration",
    icon: "🏠",
    art: "craft",
    home: true,
    children: ["Decorative Panels", "LED Decor", "Wooden Decor", "Photo Decor"],
  },
  {
    name: "Customized Gifts",
    icon: "✨",
    art: "gift",
    home: true,
    children: [
      "Photo Gifts",
      "Name Gifts",
      "Personalized Frames",
      "Personalized Mugs",
      "Custom Home Decor",
      "Custom Couple Gifts",
    ],
  },
];

/** [subcategory slug, extra parent slug] — the same row shown in a second place. */
const CROSS_LINKS: [string, string][] = [
  ["birthday-mugs", "birthday-gifts"],
  ["birthday-frames", "photo-frames"],
  ["birthday-name-plates", "name-plates"],
  ["anniversary-mugs", "anniversary-gifts"],
  ["anniversary-frames", "anniversary-gifts"],
  ["couple-frames", "couple-gifts"],
  ["couple-mugs", "couple-gifts"],
  ["couple-name-plates", "name-plates"],
  ["romantic-gifts", "anniversary-gifts"],
  ["couple-gifts", "anniversary-gifts"],
  ["couple-gifts", "wedding-gifts"],
  ["wedding-frames", "photo-frames"],
  ["wedding-name-plates", "name-plates"],
  ["wall-decor", "home-decoration"],
  ["name-plates", "home-decoration"],
  ["photo-decor", "customized-gifts"],
  ["personalized-frames", "photo-frames"],
  ["personalized-mugs", "photo-mugs"],
];

/* -------------------------------------------------------------- products */

type ProductSeed = {
  name: string;
  sub: string;
  art: keyof typeof SWATCHES;
  price: number;
  sale?: number;
  stock: number;
  material?: string;
  color?: string;
  size?: string;
  occasion?: string;
  personalize?: boolean;
  best?: boolean;
  trending?: boolean;
  short: string;
  tags: string[];
  variants?: { name: string; value: string; delta: number; stock: number }[];
};

const PRODUCTS: ProductSeed[] = [
  // ---- Name plates
  { name: "Personalized Wooden Name Plate", sub: "Wooden Name Plates", art: "nameplate", price: 1299, sale: 899, stock: 40, material: "Sheesham wood", color: "Walnut", size: "12 x 6 in", occasion: "Housewarming", personalize: true, best: true, trending: true, short: "Hand-finished sheesham with engraved lettering, sealed for outdoor use.", tags: ["name plate", "wooden", "house", "engraved"], variants: [{ name: "Size", value: "12 x 6 in", delta: 0, stock: 20 }, { name: "Size", value: "16 x 8 in", delta: R(350), stock: 14 }, { name: "Size", value: "20 x 10 in", delta: R(700), stock: 6 }] },
  { name: "Custom Acrylic Name Plate", sub: "Acrylic Name Plates", art: "nameplate", price: 999, sale: 699, stock: 55, material: "5 mm acrylic", color: "Frosted", size: "12 x 5 in", occasion: "Housewarming", personalize: true, best: true, short: "Laser-cut frosted acrylic with flame-polished edges and standoff fixings.", tags: ["name plate", "acrylic", "modern"], variants: [{ name: "Finish", value: "Frosted", delta: 0, stock: 30 }, { name: "Finish", value: "Clear", delta: 0, stock: 15 }, { name: "Finish", value: "Black", delta: R(80), stock: 10 }] },
  { name: "LED Backlit Name Plate", sub: "LED Name Plates", art: "nameplate", price: 3499, sale: 2799, stock: 18, material: "Acrylic + warm LED", color: "White glow", size: "18 x 9 in", occasion: "Housewarming", personalize: true, trending: true, short: "Warm-white LED behind a routed acrylic face. Runs on a 12V adapter, included.", tags: ["name plate", "led", "backlit", "premium"] },
  { name: "Brass Finish Door Name Plate", sub: "Door Name Plates", art: "nameplate", price: 1899, sale: 1499, stock: 26, material: "Brass-finished steel", color: "Antique brass", size: "10 x 4 in", occasion: "Housewarming", personalize: true, short: "Etched and enamel-filled, with an antique patina that will not rust indoors.", tags: ["name plate", "brass", "door", "etched"] },
  { name: "Family Name Plate with Ganesha Motif", sub: "Custom Name Plates", art: "nameplate", price: 2299, sale: 1749, stock: 22, material: "MDF + acrylic", color: "Multicolour", size: "14 x 10 in", occasion: "Housewarming", personalize: true, best: true, short: "Layered MDF with a hand-painted Ganesha and your family name below.", tags: ["name plate", "ganesha", "traditional", "family"] },
  { name: "Minimal Apartment Number Plate", sub: "Custom Name Plates", art: "nameplate", price: 749, sale: 549, stock: 60, material: "SS304", color: "Brushed steel", size: "8 x 4 in", occasion: "Housewarming", personalize: true, short: "Brushed stainless with deep-etched numerals. Adhesive backing included.", tags: ["name plate", "apartment", "steel", "minimal"] },

  // ---- Photo frames
  { name: "Personalized Couple Photo Frame", sub: "Couple Frames", art: "frame", price: 999, sale: 699, stock: 48, material: "Engineered wood", color: "Natural oak", size: "8 x 12 in", occasion: "Anniversary", personalize: true, best: true, trending: true, short: "Your photo engraved onto a warm oak panel with both names beneath.", tags: ["photo frame", "couple", "anniversary", "engraved"], variants: [{ name: "Size", value: "8 x 12 in", delta: 0, stock: 28 }, { name: "Size", value: "12 x 18 in", delta: R(450), stock: 20 }] },
  { name: "LED Photo Frame with Warm Glow", sub: "LED Photo Frames", art: "frame", price: 1499, sale: 999, stock: 32, material: "Acrylic + LED", color: "Clear", size: "10 x 8 in", occasion: "Birthday", personalize: true, trending: true, short: "Etched acrylic that lights the photo edge-on. USB powered.", tags: ["photo frame", "led", "glow", "gift"] },
  { name: "Six Photo Collage Frame", sub: "Collage Frames", art: "frame", price: 1899, sale: 1349, stock: 30, material: "MDF + laminate", color: "White", size: "16 x 20 in", occasion: "Anniversary", personalize: true, best: true, short: "Six openings, acid-free mount board, ready to hang. Send six photos.", tags: ["photo frame", "collage", "memories", "wall"] },
  { name: "Solid Teak Single Photo Frame", sub: "Wooden Photo Frames", art: "frame", price: 2299, sale: 1890, stock: 20, material: "Teak", color: "Honey", size: "12 x 18 in", occasion: "Wedding", short: "Seasoned teak, mitred and oil-finished. Grain varies piece to piece.", tags: ["photo frame", "teak", "premium", "wooden"] },
  { name: "Family Tree Photo Frame", sub: "Family Frames", art: "frame", price: 2799, sale: 2099, stock: 16, material: "MDF, 4 layers", color: "Walnut", size: "18 x 24 in", occasion: "Housewarming", personalize: true, short: "A routed tree with room for nine photographs across three generations.", tags: ["photo frame", "family", "tree", "large"] },
  { name: "Classic Single Photo Frame", sub: "Single Photo Frames", art: "frame", price: 699, sale: 449, stock: 80, material: "MDF + laminate", color: "Black", size: "8 x 10 in", occasion: "Everyday", short: "The plain, well-made frame — 2.5 mm acrylic glazing, easel back and hook.", tags: ["photo frame", "classic", "budget"] },
  { name: "Retro Film Strip Photo Frame", sub: "Collage Frames", art: "frame", price: 1199, sale: 849, stock: 24, material: "Acrylic", color: "Charcoal", size: "24 x 6 in", occasion: "Birthday", personalize: true, short: "Five photos in a film-strip run. A good desk piece.", tags: ["photo frame", "retro", "film", "desk"] },

  // ---- Mugs
  { name: "Customized Photo Mug", sub: "Personalized Photo Mugs", art: "mug", price: 499, sale: 299, stock: 120, material: "Ceramic", color: "White", size: "325 ml", occasion: "Birthday", personalize: true, best: true, trending: true, short: "Your photo printed edge to edge. Dishwasher safe, microwave safe.", tags: ["mug", "photo", "personalized", "coffee"] },
  { name: "Magic Colour Changing Mug", sub: "Magic Mugs", art: "mug", price: 699, sale: 399, stock: 90, material: "Ceramic, heat reactive", color: "Black to white", size: "325 ml", occasion: "Birthday", personalize: true, best: true, trending: true, short: "Black until hot tea goes in, then your photo appears. Always a good reaction.", tags: ["mug", "magic", "surprise", "photo"] },
  { name: "Couple Mug Set of Two", sub: "Couple Mugs", art: "mug", price: 999, sale: 649, stock: 64, material: "Ceramic", color: "White", size: "325 ml each", occasion: "Anniversary", personalize: true, best: true, short: "A matched pair, one line of text on each. Boxed together.", tags: ["mug", "couple", "set", "anniversary"] },
  { name: "Birthday Confetti Photo Mug", sub: "Birthday Mugs", art: "mug", price: 549, sale: 349, stock: 75, material: "Ceramic", color: "Multicolour", size: "325 ml", occasion: "Birthday", personalize: true, short: "Confetti border with the birthday name and age printed in.", tags: ["mug", "birthday", "confetti"] },
  { name: "Quote Printed Ceramic Mug", sub: "Printed Mugs", art: "mug", price: 399, sale: 249, stock: 140, material: "Ceramic", color: "White", size: "325 ml", occasion: "Everyday", short: "Pick a line from our set, or send your own. No photo needed.", tags: ["mug", "quote", "printed", "office"] },
  { name: "Insulated Steel Photo Tumbler", sub: "Personalized Photo Mugs", art: "mug", price: 1299, sale: 899, stock: 40, material: "Stainless steel", color: "Matte black", size: "450 ml", occasion: "Everyday", personalize: true, short: "Keeps chai hot for six hours. Photo printed with a durable UV process.", tags: ["mug", "tumbler", "steel", "travel"] },

  // ---- Crafts
  { name: "Handmade Macrame Wall Hanging", sub: "Wall Decor", art: "craft", price: 1499, sale: 1099, stock: 28, material: "Cotton cord", color: "Ivory", size: "24 x 36 in", occasion: "Housewarming", best: true, short: "Hand-knotted by artisans in Jaipur. Every piece hangs a little differently.", tags: ["craft", "macrame", "wall", "handmade"] },
  { name: "Terracotta Warli Showpiece", sub: "Decorative Showpieces", art: "craft", price: 899, sale: 649, stock: 34, material: "Terracotta", color: "Earth", size: "9 in tall", occasion: "Housewarming", short: "Wheel-thrown and hand-painted in traditional Warli figures.", tags: ["craft", "terracotta", "warli", "traditional"] },
  { name: "Resin Art Coaster Set", sub: "Resin Crafts", art: "craft", price: 1199, sale: 799, stock: 45, material: "Epoxy resin", color: "Ocean blue", size: "4 in, set of 4", occasion: "Housewarming", trending: true, short: "Poured by hand, so no two sets have the same pattern. Cork backed.", tags: ["craft", "resin", "coaster", "set"] },
  { name: "Hand-Painted Madhubani Wall Plate", sub: "Wooden Crafts", art: "craft", price: 1699, sale: 1249, stock: 18, material: "MDF", color: "Multicolour", size: "12 in round", occasion: "Festival", short: "Madhubani work in natural pigments, sealed with a matte varnish.", tags: ["craft", "madhubani", "painting", "wall"] },
  { name: "Dried Flower Resin Photo Block", sub: "Resin Crafts", art: "craft", price: 1399, sale: 999, stock: 26, material: "Resin", color: "Clear", size: "5 x 7 in", occasion: "Anniversary", personalize: true, short: "Your photo suspended in resin with real pressed flowers around it.", tags: ["craft", "resin", "flowers", "photo"] },
  { name: "Brass Diya Set with Wooden Tray", sub: "Wooden Crafts", art: "craft", price: 1899, sale: 1399, stock: 30, material: "Brass + mango wood", color: "Brass", size: "Set of 5", occasion: "Festival", best: true, short: "Five cast diyas on a turned mango-wood tray. Cleans up with tamarind.", tags: ["craft", "diya", "brass", "diwali", "festival"] },

  // ---- Gifts
  { name: "Birthday Gift Hamper", sub: "Personalized Birthday Gifts", art: "hamper", price: 1299, sale: 799, stock: 50, material: "Assorted", color: "Multicolour", size: "Medium box", occasion: "Birthday", personalize: true, best: true, trending: true, short: "Photo mug, engraved keychain, chocolates and a card, boxed with ribbon.", tags: ["gift", "hamper", "birthday", "box"] },
  { name: "Anniversary Memory Box", sub: "Personalized Anniversary Gifts", art: "hamper", price: 2499, sale: 1899, stock: 24, material: "Pine wood", color: "Natural", size: "10 x 8 x 4 in", occasion: "Anniversary", personalize: true, best: true, short: "An engraved keepsake box with ten printed photo cards inside.", tags: ["gift", "anniversary", "box", "memories"] },
  { name: "Wedding Couple Caricature Frame", sub: "Personalized Wedding Gifts", art: "gift", price: 2999, sale: 2199, stock: 20, material: "MDF + print", color: "Multicolour", size: "12 x 16 in", occasion: "Wedding", personalize: true, trending: true, short: "An illustrator draws the couple from your photo. Allow five days.", tags: ["gift", "wedding", "caricature", "couple"] },
  { name: "Engraved Couple Keychain Pair", sub: "Personalized Couple Gifts", art: "gift", price: 599, sale: 349, stock: 110, material: "Stainless steel", color: "Silver", size: "2 in", occasion: "Anniversary", personalize: true, best: true, short: "Two keychains, names on the front, a date on the back.", tags: ["gift", "couple", "keychain", "engraved"] },
  { name: "Kids Cartoon Photo Cushion", sub: "Kids Birthday Gifts", art: "gift", price: 899, sale: 599, stock: 55, material: "Poly-satin", color: "Sky blue", size: "16 x 16 in", occasion: "Birthday", personalize: true, short: "Photo printed on a soft cushion cover, filler included.", tags: ["gift", "kids", "cushion", "cartoon"] },
  { name: "Diwali Festive Gift Box", sub: "Custom Home Decor", art: "hamper", price: 1799, sale: 1299, stock: 40, material: "Assorted", color: "Gold", size: "Large box", occasion: "Festival", best: true, short: "Brass diya pair, dry fruits, a scented candle and a personalised card.", tags: ["gift", "diwali", "festival", "hamper", "corporate"] },
  { name: "Personalised Photo Wall Clock", sub: "Personalized Birthday Gifts", art: "gift", price: 1299, sale: 899, stock: 38, material: "Ply + acrylic", color: "Walnut", size: "10 in round", occasion: "Birthday", personalize: true, short: "Silent sweep movement, your photo behind the hands. Battery included.", tags: ["gift", "clock", "photo", "wall"] },
  { name: "Spotify Style Music Plaque", sub: "Personalized Couple Gifts", art: "gift", price: 1199, sale: 849, stock: 42, material: "Acrylic", color: "Black", size: "6 x 9 in", occasion: "Anniversary", personalize: true, trending: true, short: "Your song and your photo on a scannable acrylic plaque.", tags: ["gift", "music", "couple", "acrylic"] },
  { name: "Engraved Wooden Photo Puzzle", sub: "Kids Birthday Gifts", art: "gift", price: 799, sale: 549, stock: 48, material: "Birch ply", color: "Natural", size: "8 x 10 in, 48 pieces", occasion: "Birthday", personalize: true, short: "Your photo laser-cut into a 48-piece puzzle, boxed in a wooden tray.", tags: ["gift", "puzzle", "kids", "photo"] },
  { name: "Corporate Acrylic Award Trophy", sub: "Custom Home Decor", art: "gift", price: 1499, sale: 999, stock: 60, material: "12 mm acrylic", color: "Clear", size: "8 in tall", occasion: "Corporate", personalize: true, short: "Sand-etched with your logo and citation. Bulk rates from fifty pieces.", tags: ["gift", "corporate", "trophy", "award", "bulk"] },
];

/* ------------------------------------------------------------------ main */

async function main() {
  const wipeEverything = process.argv.includes("--wipe");

  console.log("→ writing placeholder artwork");
  writePlaceholders();

  /* TRUNCATE ... CASCADE on products reaches order_items, and through it the
   * order history. That is fine on a fresh database and catastrophic on a live
   * one, so refuse rather than discover it afterwards.                        */
  const existingOrders = await db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM orders`,
  );
  if (Number(existingOrders.rows[0]?.n ?? 0) > 0 && !wipeEverything) {
    console.error(
      `\n✗ Refusing to seed: this database already holds ${existingOrders.rows[0].n} order(s).\n` +
        "  Re-seeding rebuilds the catalogue and would take the order history with it.\n" +
        "  Pass --wipe if you really want to erase everything.\n",
    );
    process.exit(1);
  }

  console.log("→ clearing catalogue");
  if (wipeEverything) {
    await db.execute(sql`TRUNCATE TABLE
      order_events, order_items, payments, coupon_redemptions, orders,
      cart_items, carts, wishlist_items, reviews, notifications,
      inventory_movements, sessions, addresses
      RESTART IDENTITY CASCADE`);
  }
  await db.execute(sql`TRUNCATE TABLE
    product_images, product_variants, customization_fields, products,
    category_cross_links, categories, coupons, banners, settings
    RESTART IDENTITY CASCADE`);

  /* -- categories ------------------------------------------------------- */
  console.log("→ categories");
  const subIdByName = new Map<string, string>();

  /** Pick artwork that matches what the subcategory actually is. */
  function artFor(name: string, fallback: keyof typeof SWATCHES): keyof typeof SWATCHES {
    const n = name.toLowerCase();
    if (n.includes("plate")) return "nameplate";
    if (n.includes("frame")) return "frame";
    if (n.includes("mug")) return "mug";
    if (n.includes("hamper") || n.includes("wedding")) return "hamper";
    if (n.includes("craft") || n.includes("decor") || n.includes("flower")) return "craft";
    return fallback;
  }

  const idBySlug = new Map<string, string>();

  for (const [i, top] of CATEGORY_TREE.entries()) {
    const topSlug = slugify(top.name);
    const [parent] = await db
      .insert(categories)
      .values({
        name: top.name,
        slug: topSlug,
        icon: top.icon,
        position: i,
        showOnHome: top.home ?? false,
        imageUrl: `/placeholders/${top.art}.svg`,
      })
      .returning({ id: categories.id });

    idBySlug.set(topSlug, parent.id);

    for (const [j, childName] of top.children.entries()) {
      const childSlug = slugify(childName);
      const [child] = await db
        .insert(categories)
        .values({
          parentId: parent.id,
          name: childName,
          slug: childSlug,
          position: j,
          imageUrl: `/placeholders/${artFor(childName, top.art)}.svg`,
        })
        .returning({ id: categories.id });
      subIdByName.set(childName, child.id);
      idBySlug.set(childSlug, child.id);
    }
  }

  console.log("→ cross-links");
  for (const [childSlug, parentSlug] of CROSS_LINKS) {
    const categoryId = idBySlug.get(childSlug);
    const parentId = idBySlug.get(parentSlug);
    if (!categoryId || !parentId) {
      throw new Error(`Cross-link refers to a missing slug: ${childSlug} -> ${parentSlug}`);
    }
    await db
      .insert(categoryCrossLinks)
      .values({ categoryId, parentId })
      .onConflictDoNothing();
  }

  /* -- products --------------------------------------------------------- */
  console.log(`→ ${PRODUCTS.length} products`);
  let skuCounter = 1000;

  for (const p of PRODUCTS) {
    const categoryId = subIdByName.get(p.sub);
    if (!categoryId) throw new Error(`Unknown subcategory in seed: ${p.sub}`);

    const [row] = await db
      .insert(products)
      .values({
        categoryId,
        name: p.name,
        slug: slugify(p.name),
        sku: `SR-${++skuCounter}`,
        shortDescription: p.short,
        description: `${p.short}\n\nMade to order in our workshop. Every piece is checked by hand before it is packed. Personalised items are produced only after you approve the artwork proof, which we send within one working day of your order.\n\nCare: wipe with a dry cloth. Keep engraved wood out of direct sunlight.`,
        priceP: R(p.price),
        discountPriceP: p.sale ? R(p.sale) : null,
        material: p.material,
        color: p.color,
        size: p.size,
        occasion: p.occasion,
        tags: p.tags,
        stock: p.stock,
        lowStockThreshold: 10,
        isPersonalizable: p.personalize ?? false,
        isBestSeller: p.best ?? false,
        isTrending: p.trending ?? false,
        brand: "Shiv Radium",
        metaTitle: null,
        metaDescription: p.short,
      })
      .returning({ id: products.id });

    await db.insert(productImages).values([
      { productId: row.id, url: `/placeholders/${p.art}.svg`, alt: p.name, position: 0, isPrimary: true },
      { productId: row.id, url: `/placeholders/${p.art}.svg`, alt: `${p.name} detail`, position: 1 },
    ]);

    if (p.variants?.length) {
      await db.insert(productVariants).values(
        p.variants.map((v, k) => ({
          productId: row.id,
          name: v.name,
          value: v.value,
          priceDeltaP: v.delta,
          stock: v.stock,
          position: k,
        })),
      );
    }

    if (p.personalize) {
      await db.insert(customizationFields).values([
        {
          productId: row.id,
          type: "IMAGE" as const,
          label: "Upload your photo",
          helpText: "JPG, PNG or WebP up to 8 MB. Send the largest original you have.",
          isRequired: true,
          position: 0,
        },
        {
          productId: row.id,
          type: "TEXT" as const,
          label: "Name to print",
          helpText: "Exactly as it should appear, including spelling and punctuation.",
          isRequired: true,
          maxLength: 40,
          position: 1,
        },
        {
          productId: row.id,
          type: "TEXT" as const,
          label: "Message or date",
          helpText: "Optional second line.",
          isRequired: false,
          maxLength: 80,
          position: 2,
        },
        {
          productId: row.id,
          type: "FONT" as const,
          label: "Font",
          isRequired: false,
          options: ["Classic Serif", "Modern Sans", "Handwriting", "Devanagari"],
          position: 3,
        },
      ]);
    }
  }

  /* -- coupons ---------------------------------------------------------- */
  console.log("→ coupons");
  await db.insert(coupons).values([
    {
      code: "WELCOME150",
      description: "₹150 off your first order above ₹799",
      discountType: "FIXED",
      discountValue: R(150),
      minOrderP: R(799),
      perUserLimit: 1,
      isActive: true,
    },
    {
      code: "GIFT20",
      description: "20% off, up to ₹400",
      discountType: "PERCENT",
      discountValue: 20,
      minOrderP: R(999),
      maxDiscountP: R(400),
      perUserLimit: 3,
      isActive: true,
    },
    {
      code: "FESTIVE10",
      description: "10% off festival gifting",
      discountType: "PERCENT",
      discountValue: 10,
      minOrderP: R(499),
      maxDiscountP: R(250),
      usageLimit: 500,
      perUserLimit: 2,
      isActive: true,
    },
  ]);

  /* -- banners ---------------------------------------------------------- */
  console.log("→ banners");
  await db.insert(banners).values([
    {
      title: "Make Every Moment Special",
      subtitle: "Personalised gifts made just for you",
      ctaLabel: "Shop Now",
      href: "/category/gifts",
      placement: "HERO",
      position: 0,
      imageUrl: "/placeholders/gift.svg",
    },
    {
      title: "Special Gifts Starting From ₹199",
      subtitle: "Small budget, big reaction",
      ctaLabel: "See offers",
      href: "/search?sort=discount",
      placement: "OFFER",
      position: 0,
      imageUrl: "/placeholders/hamper.svg",
    },
  ]);

  /* -- settings --------------------------------------------------------- */
  await db.insert(settings).values([
    { key: "shop", value: { name: "Shiv Radium", tagline: "Personalised gifts made just for you" } },
    { key: "shipping", value: { flatRateP: R(59), freeAboveP: R(999) } },
    { key: "tax", value: { gstPercent: 18, pricesIncludeTax: true } },
  ]);

  /* -- accounts --------------------------------------------------------- */
  console.log("→ accounts");
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@shivradium.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? randomBytes(9).toString("base64url");

  await db
    .insert(users)
    .values({
      name: "Shop Owner",
      email: adminEmail,
      role: "ADMIN",
      passwordHash: await hashPassword(adminPassword),
    })
    .onConflictDoNothing();

  const demoEmail = "demo@shivradium.local";
  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? "demo1234";
  await db
    .insert(users)
    .values({
      name: "Priya Deshmukh",
      email: demoEmail,
      phone: "9876543210",
      role: "USER",
      passwordHash: await hashPassword(demoPassword),
    })
    .onConflictDoNothing();

  /* -- demo reviews ------------------------------------------------------
   * Without these every product card reads "New arrival" and the homepage
   * review section stays empty. These are DEMO rows — delete them before you
   * go live (they are the only reviews with no linked order).                */
  console.log("→ demo reviews");

  const REVIEWERS = [
    "Anjali Nair", "Rohit Menon", "Fatima Shaikh", "Vikram Rao",
    "Sneha Kulkarni", "Imran Qureshi", "Divya Pillai", "Arjun Bhatt",
  ];
  const BLURBS: [number, string, string][] = [
    [5, "Exactly as pictured", "Ordered for my sister's housewarming and the engraving was crisp. The proof came the next morning and they fixed a spelling I got wrong."],
    [5, "Better than expected", "The finish is properly solid, not the thin board you get on marketplaces. Packed with corner guards, arrived without a scratch."],
    [4, "Good, delivery took a day longer", "Product quality is genuinely nice and the colours match the photo. Courier was a day late but they kept me updated on WhatsApp."],
    [5, "Made a great gift", "Gave this for our anniversary and it got a real reaction. The photo printing is sharp even close up."],
    [4, "Nice work, small gap", "Lovely piece overall. One corner had a tiny gap in the joint, nothing you notice once it is on the wall."],
    [5, "Worth the price", "Cheaper options exist but the material here is clearly better. Would order again for Diwali."],
    [5, "Fast and helpful", "Needed it in four days for a birthday and they managed it. Customer support actually answered the phone."],
    [4, "Happy with it", "Good quality and the personalisation was spot on. Wish there were more font choices."],
  ];

  const reviewerIds: string[] = [];
  for (const name of REVIEWERS) {
    const email = `${slugify(name)}@example.com`;

    // The unique index on users is on lower(email), a functional index, which
    // Postgres cannot use as an ON CONFLICT arbiter — so look first, then insert.
    const found = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);

    if (found[0]) {
      reviewerIds.push(found[0].id);
      continue;
    }

    const [row] = await db
      .insert(users)
      .values({
        name,
        email,
        role: "USER",
        passwordHash: await hashPassword(randomBytes(12).toString("base64url")),
      })
      .returning({ id: users.id });
    reviewerIds.push(row.id);
  }

  const allProducts = await db.select({ id: products.id }).from(products);
  let blurbCursor = 0;

  for (const [index, product] of allProducts.entries()) {
    // Vary how many reviews each product has, so ratings are not uniform.
    const howMany = (index % 4) + 1;
    let sum = 0;

    for (let n = 0; n < howMany; n++) {
      const [rating, title, body] = BLURBS[blurbCursor++ % BLURBS.length];
      const reviewer = reviewerIds[(index + n) % reviewerIds.length];
      await db
        .insert(reviews)
        .values({ productId: product.id, userId: reviewer, rating, title, body, status: "APPROVED" })
        .onConflictDoNothing();
      sum += rating;
    }

    await db
      .update(products)
      .set({ ratingSum: sum, ratingCount: howMany })
      .where(sql`${products.id} = ${product.id}`);
  }

  console.log("\n✓ Seed complete\n");
  console.log("  Admin    ", adminEmail);
  console.log("  Password ", adminPassword);
  console.log("  (set SEED_ADMIN_PASSWORD in .env.local to choose your own, then re-run)\n");
  console.log("  Customer ", demoEmail, "/", demoPassword, "\n");

  process.exit(0);
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
