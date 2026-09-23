import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { eq } from "drizzle-orm";

import { customizerConfigSchema, type CustomizerConfig } from "@/lib/customizer/schema";
import { db, schema } from "@/server/db";

/**
 * Adds a set of personalised name-plate and photo-frame products, each wired
 * to the Frame Designer so a customer can set the name, photo, wording, size,
 * colour and font within what the template allows.
 *
 * These are Shiv Radium's own products. The reference a customer might have
 * seen elsewhere is not copied: names, wording and artwork here are original,
 * placeholder art is generated locally (the admin swaps in real photography),
 * and no invented "sold in the last N hours" urgency is stored anywhere.
 *
 * Idempotent: keyed by slug, so re-running updates in place rather than
 * duplicating. Run with:  pnpm db:seed:frames
 */

const { products, productImages, categories } = schema;

/* --------------------------------------------------- placeholder artwork ---
 * Original, generic mock-ups so the cards and the customizer look real before
 * the admin uploads photographs. Plain shapes and sample text — nothing copied.
 */

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const PLACEHOLDER_DIR = join(process.cwd(), "public", "placeholders");

/** A soft neutral wall the customizer draws the template on. */
function backdropSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fafafa"/><stop offset="1" stop-color="#eceef1"/></linearGradient></defs><rect width="800" height="800" fill="url(#g)"/></svg>`;
}

/** A card mock of a name plate: coloured plaque with sample wording. */
function plateCardSvg(o: { plaque: string; text: string; name: string; sub: string }): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
  <rect width="800" height="800" fill="#eceef1"/>
  <rect x="60" y="250" width="680" height="300" rx="28" fill="${o.plaque}"/>
  <text x="400" y="410" font-family="Georgia, serif" font-size="96" font-weight="700" fill="${o.text}" text-anchor="middle">${esc(o.name)}</text>
  <text x="400" y="480" font-family="Georgia, serif" font-size="30" letter-spacing="3" fill="${o.text}" fill-opacity="0.85" text-anchor="middle">${esc(o.sub.toUpperCase())}</text>
</svg>`;
}

/** A card mock of a framed photo collage: frame, mat, photo area, wording. */
function frameCardSvg(o: { frame: string; names: string; date: string }): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
  <rect width="800" height="800" fill="#eceef1"/>
  <rect x="120" y="90" width="560" height="620" rx="8" fill="${o.frame}"/>
  <rect x="150" y="120" width="500" height="560" rx="2" fill="#ffffff"/>
  <text x="400" y="205" font-family="'Brush Script MT', cursive" font-size="52" fill="#0f121f" text-anchor="middle">${esc(o.names)}</text>
  <text x="400" y="250" font-family="Georgia, serif" font-size="26" fill="#70747e" text-anchor="middle">${esc(o.date)}</text>
  <rect x="205" y="285" width="390" height="300" rx="4" fill="#e7e7e9"/>
  <text x="400" y="445" font-family="Georgia, serif" font-size="30" fill="#acafb6" text-anchor="middle">YOUR PHOTO</text>
</svg>`;
}

function writePlaceholders(files: Record<string, string>): void {
  mkdirSync(PLACEHOLDER_DIR, { recursive: true });
  for (const [name, svg] of Object.entries(files)) {
    writeFileSync(join(PLACEHOLDER_DIR, `${name}.svg`), svg, "utf8");
  }
}

/* ----------------------------------------------------------- config builders */

const SIZE_TEXTS = [
  { label: "S", px: 18 },
  { label: "M", px: 24 },
  { label: "L", px: 32 },
  { label: "XL", px: 40 },
];

const font = (name: string) => ({ name, source: "google" as const, url: "", format: "" as const });

/** A name-plate template: the plaque follows the frame colour, name + address
 *  are text the customer sets, size/thickness/mounting move the price. */
function plateConfig(o: {
  templateName: string;
  base: string;
  plaque: string;
  frameColors: string[];
  textColors: string[];
  fonts: string[];
  defaultFont: string;
  namePlaceholder: string;
  subPlaceholder: string;
}): CustomizerConfig {
  return customizerConfigSchema.parse({
    enabled: true,
    templateName: o.templateName,
    colorNotice: true,
    views: [{ id: "front", label: "Front", base: o.base, zoneIds: ["plaque", "name", "sub"] }],
    zones: [
      {
        id: "plaque",
        kind: "FRAME",
        label: "Plate",
        x: 7.5,
        y: 31,
        width: 85,
        height: 38,
        cornerRadius: 14,
        fill: o.plaque,
        tintByFrameColor: true,
        required: false,
      },
      {
        id: "name",
        kind: "TEXT",
        label: "Name",
        x: 12,
        y: 36,
        width: 76,
        height: 16,
        fontSizePct: 68,
        color: o.textColors[0],
        align: "center",
        defaultText: o.namePlaceholder,
        maxChars: 24,
        required: true,
      },
      {
        id: "sub",
        kind: "TEXT",
        label: "Address / society",
        x: 12,
        y: 55,
        width: 76,
        height: 8,
        fontSizePct: 34,
        color: o.textColors[0],
        align: "center",
        defaultText: o.subPlaceholder,
        maxChars: 44,
        required: false,
      },
    ],
    optionGroups: [
      {
        id: "size",
        label: "Size",
        kind: "CHOICE",
        options: [
          { id: "s48", label: "4×8 in", priceDeltaP: 0 },
          { id: "s612", label: "6×12 in", priceDeltaP: 30000 },
          { id: "s816", label: "8×16 in", priceDeltaP: 70000 },
          { id: "s918", label: "9×18 in", priceDeltaP: 110000 },
        ],
      },
      {
        id: "thickness",
        label: "Thickness",
        kind: "CHOICE",
        options: [
          { id: "t3", label: "3 mm", priceDeltaP: 0 },
          { id: "t5", label: "5 mm", priceDeltaP: 15000 },
          { id: "t8", label: "8 mm", priceDeltaP: 35000 },
        ],
      },
      {
        id: "mount",
        label: "Mounting",
        kind: "CHOICE",
        helpText: "How the plate fixes to your wall or door.",
        options: [
          { id: "tape", label: "Double-sided tape", priceDeltaP: 0 },
          { id: "holes", label: "Holes only", priceDeltaP: 0 },
          { id: "screws", label: "Holes with screws", priceDeltaP: 5000 },
        ],
      },
    ],
    customerOptions: {
      frameColor: { enabled: true, colors: o.frameColors, default: o.plaque },
      textColor: { enabled: true, colors: o.textColors, default: o.textColors[0] },
      font: { enabled: true, families: o.fonts.map(font), default: o.defaultFont },
      textSize: { enabled: true, choices: SIZE_TEXTS, default: 24 },
    },
  });
}

/** A photo-frame / collage template: a photo the customer uploads, names and a
 *  date, inside a frame whose colour they choose; size moves the price. */
function frameConfig(o: {
  templateName: string;
  base: string;
  frameColors: string[];
  textColors: string[];
  fonts: string[];
  defaultFont: string;
  namesPlaceholder: string;
  datePlaceholder: string;
}): CustomizerConfig {
  return customizerConfigSchema.parse({
    enabled: true,
    templateName: o.templateName,
    colorNotice: true,
    views: [{ id: "front", label: "Front", base: o.base, zoneIds: ["frame", "mat", "photo", "names", "date"] }],
    zones: [
      {
        id: "frame",
        kind: "FRAME",
        label: "Frame",
        x: 15,
        y: 11,
        width: 70,
        height: 78,
        cornerRadius: 2,
        fill: o.frameColors[0],
        tintByFrameColor: true,
        required: false,
      },
      {
        id: "mat",
        kind: "FRAME",
        label: "Mat",
        x: 18,
        y: 14,
        width: 64,
        height: 72,
        cornerRadius: 1,
        fill: "#ffffff",
        tintByFrameColor: false,
        required: false,
      },
      {
        id: "photo",
        kind: "PHOTO",
        label: "Your photo",
        x: 23,
        y: 28,
        width: 54,
        height: 40,
        printWidthMm: 200,
        printHeightMm: 150,
        minDpi: 150,
        required: true,
      },
      {
        id: "names",
        kind: "TEXT",
        label: "Names",
        x: 20,
        y: 71,
        width: 60,
        height: 8,
        fontSizePct: 55,
        color: o.textColors[0],
        align: "center",
        defaultText: o.namesPlaceholder,
        maxChars: 30,
        required: false,
      },
      {
        id: "date",
        kind: "TEXT",
        label: "Date",
        x: 20,
        y: 80,
        width: 60,
        height: 5,
        fontSizePct: 34,
        color: "#70747e",
        align: "center",
        defaultText: o.datePlaceholder,
        maxChars: 20,
        required: false,
      },
    ],
    optionGroups: [
      {
        id: "size",
        label: "Size",
        kind: "CHOICE",
        options: [
          { id: "s812", label: "8×12 in", priceDeltaP: 0 },
          { id: "s1015", label: "10×15 in", priceDeltaP: 25000 },
          { id: "s1218", label: "12×18 in", priceDeltaP: 50000 },
          { id: "s1624", label: "16×24 in", priceDeltaP: 120000 },
        ],
      },
    ],
    customerOptions: {
      frameColor: { enabled: true, colors: o.frameColors, default: o.frameColors[0] },
      textColor: { enabled: true, colors: o.textColors, default: o.textColors[0] },
      font: { enabled: true, families: o.fonts.map(font), default: o.defaultFont },
      textSize: { enabled: true, choices: SIZE_TEXTS, default: 24 },
    },
  });
}

/* --------------------------------------------------------------- products */

const WOOD = "#8a5a2b";
const BLACK = "#0f121f";
const NAVY = "#151b39";

type ProductDef = {
  name: string;
  sku: string;
  categorySlug: string;
  short: string;
  price: number;
  sale: number;
  material: string;
  color: string;
  size: string;
  occasion: string;
  tags: string[];
  card: string; // placeholder file name (without extension)
  config: CustomizerConfig;
};

const PLATE_FONTS = ["Poppins", "Playfair Display", "Lobster"];
const FRAME_FONTS = ["Great Vibes", "Pacifico", "Poppins"];
const PLATE_TEXT_COLORS = ["#ffffff", "#f6a672", "#ee722e", "#facba8"];
const PLATE_FRAME_COLORS = [BLACK, WOOD, NAVY, "#5c260c"];
const FRAME_FRAME_COLORS = [BLACK, "#ffffff", "#5c260c", WOOD];
const FRAME_TEXT_COLORS = [BLACK, "#ee722e", "#b3261e", NAVY];

const DEFS: ProductDef[] = [
  {
    name: "Mandala Acrylic Name Plate",
    sku: "SR-FD-01",
    categorySlug: "acrylic-name-plates",
    short: "A sleek acrylic door plate with a hand-drawn mandala motif and your family name in a finish you choose.",
    price: 599,
    sale: 499,
    material: "Acrylic",
    color: "Black",
    size: "4×8 in and up",
    occasion: "Housewarming",
    tags: ["name plate", "acrylic", "mandala", "door", "personalised"],
    card: "fd-mandala",
    config: plateConfig({
      templateName: "Mandala Name Plate",
      base: "/placeholders/fd-backdrop.svg",
      plaque: BLACK,
      frameColors: PLATE_FRAME_COLORS,
      textColors: PLATE_TEXT_COLORS,
      fonts: PLATE_FONTS,
      defaultFont: "Poppins",
      namePlaceholder: "Your Name",
      subPlaceholder: "House / Society",
    }),
  },
  {
    name: "Royal Peacock Door Name Plate",
    sku: "SR-FD-02",
    categorySlug: "door-name-plates",
    short: "A warm wood-toned acrylic plaque with a regal peacock accent for your main door.",
    price: 1299,
    sale: 899,
    material: "Acrylic on wood finish",
    color: "Wood",
    size: "4×8 in and up",
    occasion: "Housewarming",
    tags: ["name plate", "peacock", "door", "acrylic", "premium"],
    card: "fd-peacock",
    config: plateConfig({
      templateName: "Peacock Door Plate",
      base: "/placeholders/fd-backdrop.svg",
      plaque: WOOD,
      frameColors: [WOOD, BLACK, "#5c260c", NAVY],
      textColors: ["#0f121f", "#ffffff", "#5c260c", "#8a3a12"],
      fonts: ["Playfair Display", "Great Vibes", "Poppins"],
      defaultFont: "Playfair Display",
      namePlaceholder: "Family Name",
      subPlaceholder: "Flat / Block",
    }),
  },
  {
    name: "Modern Home Entrance Name Plate",
    sku: "SR-FD-03",
    categorySlug: "acrylic-name-plates",
    short: "A clean, contemporary acrylic plate for your entrance — set the welcome line, family name and house number.",
    price: 1199,
    sale: 999,
    material: "Acrylic",
    color: "Ivory",
    size: "6×9 in and up",
    occasion: "Housewarming",
    tags: ["name plate", "modern", "entrance", "acrylic", "personalised"],
    card: "fd-modern",
    config: plateConfig({
      templateName: "Modern Entrance Plate",
      base: "/placeholders/fd-backdrop.svg",
      plaque: "#efe7d8",
      frameColors: ["#efe7d8", WOOD, BLACK, "#5c260c"],
      textColors: ["#5c260c", "#0f121f", "#8a3a12", "#b04a17"],
      fonts: ["Playfair Display", "Poppins", "Great Vibes"],
      defaultFont: "Playfair Display",
      namePlaceholder: "Welcome",
      subPlaceholder: "The Sharmas · B-204",
    }),
  },
  {
    name: "Couple Goals Photo Collage Frame",
    sku: "SR-FD-04",
    categorySlug: "collage-frames",
    short: "A framed collage that celebrates your story — your photo, your names and a date that matters.",
    price: 999,
    sale: 749,
    material: "Framed print",
    color: "Black",
    size: "8×12 in and up",
    occasion: "Anniversary",
    tags: ["photo frame", "collage", "couple", "personalised", "anniversary"],
    card: "fd-couple",
    config: frameConfig({
      templateName: "Couple Collage",
      base: "/placeholders/fd-backdrop.svg",
      frameColors: FRAME_FRAME_COLORS,
      textColors: FRAME_TEXT_COLORS,
      fonts: FRAME_FONTS,
      defaultFont: "Great Vibes",
      namesPlaceholder: "Name & Name",
      datePlaceholder: "01.01.2025",
    }),
  },
  {
    name: "Social Profile Photo Frame",
    sku: "SR-FD-05",
    categorySlug: "personalized-frames",
    short: "A playful framed print styled like a social profile, personalised with your photo and handle.",
    price: 999,
    sale: 749,
    material: "Framed print",
    color: "Black",
    size: "8×12 in and up",
    occasion: "Birthday",
    tags: ["photo frame", "social", "profile", "personalised", "fun"],
    card: "fd-social",
    config: frameConfig({
      templateName: "Social Profile Frame",
      base: "/placeholders/fd-backdrop.svg",
      frameColors: FRAME_FRAME_COLORS,
      textColors: FRAME_TEXT_COLORS,
      fonts: ["Poppins", "Pacifico", "Great Vibes"],
      defaultFont: "Poppins",
      namesPlaceholder: "@yourhandle",
      datePlaceholder: "Est. 2025",
    }),
  },
  {
    name: "Love Birds Memory Collage Frame",
    sku: "SR-FD-06",
    categorySlug: "collage-frames",
    short: "A dove-shaped memory collage framed for the wall — your photos, your names, your date.",
    price: 899,
    sale: 599,
    material: "Framed print",
    color: "Black",
    size: "8×8 in and up",
    occasion: "Wedding",
    tags: ["photo frame", "collage", "wedding", "personalised", "memories"],
    card: "fd-lovebirds",
    config: frameConfig({
      templateName: "Love Birds Collage",
      base: "/placeholders/fd-backdrop.svg",
      frameColors: FRAME_FRAME_COLORS,
      textColors: FRAME_TEXT_COLORS,
      fonts: FRAME_FONTS,
      defaultFont: "Great Vibes",
      namesPlaceholder: "Name & Name",
      datePlaceholder: "01.01.2025",
    }),
  },
];

/* ------------------------------------------------------------------- run */

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 200);
}

const DESCRIPTION_TAIL =
  "\n\nMade to order in our workshop and checked by hand before packing. Personalised items are produced only after you approve the artwork proof, which we send within one working day of your order.\n\nCare: wipe with a dry cloth. Keep out of prolonged direct sunlight.";

async function main() {
  // Card mock-ups and the shared backdrop the customizer draws on.
  const placeholders: Record<string, string> = { "fd-backdrop": backdropSvg() };
  placeholders["fd-mandala"] = plateCardSvg({ plaque: BLACK, text: "#ffffff", name: "Ravi's", sub: "Ram Vihar" });
  placeholders["fd-peacock"] = plateCardSvg({ plaque: WOOD, text: "#0f121f", name: "Krishna", sub: "Flat B-204" });
  placeholders["fd-modern"] = plateCardSvg({ plaque: "#efe7d8", text: "#5c260c", name: "Welcome", sub: "The Sharmas" });
  placeholders["fd-couple"] = frameCardSvg({ frame: BLACK, names: "Kunal & Divya", date: "12.04.2023" });
  placeholders["fd-social"] = frameCardSvg({ frame: BLACK, names: "@lovegram", date: "Est. 2025" });
  placeholders["fd-lovebirds"] = frameCardSvg({ frame: BLACK, names: "Ronnie & Natalie", date: "08.09.1999" });
  writePlaceholders(placeholders);
  console.log(`Wrote ${Object.keys(placeholders).length} placeholder SVGs.`);

  for (const def of DEFS) {
    const slug = slugify(def.name);
    const cat = (
      await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, def.categorySlug)).limit(1)
    )[0];
    if (!cat) {
      console.log(`  SKIP ${def.name} — category "${def.categorySlug}" not found.`);
      continue;
    }

    const existing = (
      await db.select({ id: products.id }).from(products).where(eq(products.slug, slug)).limit(1)
    )[0];

    const values = {
      categoryId: cat.id,
      name: def.name,
      slug,
      shortDescription: def.short,
      description: `${def.short}${DESCRIPTION_TAIL}`,
      priceP: Math.round(def.price * 100),
      discountPriceP: Math.round(def.sale * 100),
      material: def.material,
      color: def.color,
      size: def.size,
      occasion: def.occasion,
      tags: def.tags,
      stock: 100,
      lowStockThreshold: 10,
      isPersonalizable: false,
      brand: "Shiv Radium",
      customizer: def.config,
      isActive: true,
      metaDescription: def.short.slice(0, 320),
      updatedAt: new Date(),
    };

    let productId: string;
    if (existing) {
      await db.update(products).set(values).where(eq(products.id, existing.id));
      productId = existing.id;
      console.log(`  updated  ${def.name}`);
    } else {
      const [row] = await db
        .insert(products)
        .values({ ...values, sku: def.sku })
        .returning({ id: products.id });
      productId = row.id;
      console.log(`  created  ${def.name}`);
    }

    await db.delete(productImages).where(eq(productImages.productId, productId));
    await db.insert(productImages).values([
      { productId, url: `/placeholders/${def.card}.svg`, alt: def.name, position: 0, isPrimary: true },
    ]);
  }

  console.log("\nDone. Personalise them in the Frame Designer at /admin/products/<id>/customizer.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
