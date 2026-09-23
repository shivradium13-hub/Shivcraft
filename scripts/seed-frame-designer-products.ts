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

/** A card mock of a name plate: a wide coloured plaque with sample wording,
 *  matching the customizer's plate proportions. */
function plateCardSvg(o: { plaque: string; text: string; edge?: string | null; name: string; sub: string }): string {
  const edge = o.edge
    ? `<rect x="68" y="288" width="664" height="224" rx="12" fill="none" stroke="${o.edge}" stroke-width="6"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
  <rect width="800" height="800" fill="#eceef1"/>
  <rect x="48" y="264" width="704" height="272" rx="26" fill="${o.plaque}"/>
  ${edge}
  <text x="400" y="415" font-family="Georgia, serif" font-size="104" font-weight="700" fill="${o.text}" text-anchor="middle">${esc(o.name)}</text>
  <text x="400" y="486" font-family="Georgia, serif" font-size="28" letter-spacing="3" fill="${o.text}" fill-opacity="0.85" text-anchor="middle">${esc(o.sub.toUpperCase())}</text>
</svg>`;
}

/** A card mock of a portrait framed photo: frame, mat, photo area, wording. */
function frameCardSvg(o: { frame: string; names: string; date: string }): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
  <rect width="800" height="800" fill="#eceef1"/>
  <rect x="192" y="48" width="416" height="704" rx="6" fill="${o.frame}"/>
  <rect x="216" y="72" width="368" height="656" rx="3" fill="#ffffff"/>
  <rect x="248" y="160" width="304" height="352" rx="4" fill="#e7e7e9"/>
  <text x="400" y="352" font-family="Georgia, serif" font-size="28" fill="#acafb6" text-anchor="middle">YOUR PHOTO</text>
  <text x="400" y="600" font-family="'Brush Script MT', cursive" font-size="46" fill="#0f121f" text-anchor="middle">${esc(o.names)}</text>
  <text x="400" y="645" font-family="Georgia, serif" font-size="24" fill="#70747e" text-anchor="middle">${esc(o.date)}</text>
</svg>`;
}

const GOLD_ART = "#c9a24a";

/** A wide dual-tone wooden plate with a wave-cut divide (light top, dark
 *  bottom). Baked as the base; the customizer places text over it. */
function waveCutBaseSvg(withText?: { name: string; subs: string }): string {
  const grain = Array.from({ length: 7 }, (_, i) => {
    const y = 262 + i * 42;
    return `<path d="M52,${y} q180,-10 360,0 t360,-2" fill="none" stroke="#00000012" stroke-width="2"/>`;
  }).join("");
  const text = withText
    ? `<text x="120" y="405" font-family="Georgia, serif" font-size="92" font-weight="700" fill="#5a2f18">${esc(withText.name)}</text>
       <text x="680" y="512" font-family="'Brush Script MT', cursive" font-size="52" fill="#f4e7cf" text-anchor="end">${esc(withText.subs)}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
  <rect width="800" height="800" fill="#eceef1"/>
  <defs><clipPath id="wc"><rect x="40" y="240" width="720" height="320" rx="24"/></clipPath></defs>
  <g clip-path="url(#wc)">
    <rect x="40" y="240" width="720" height="320" fill="#d9bd94"/>
    <path d="M40,432 C 210,388 330,472 470,436 S 700,392 760,424 L 760,560 L 40,560 Z" fill="#7a4a28"/>
    <path d="M40,432 C 210,388 330,472 470,436 S 700,392 760,424" fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="3"/>
    ${grain}
  </g>
  <rect x="40" y="240" width="720" height="320" rx="24" fill="none" stroke="#5a3a1e" stroke-opacity="0.3" stroke-width="3"/>
  ${text}
</svg>`;
}

/** Gold corner flourishes and silver bolts for the vertical acrylic plate,
 *  drawn as an overlay so the plate colour beneath can still change. */
function goldCornersOverlaySvg(): string {
  const L = 240, R = 560, T = 96, B = 704;
  const corner = (x: number, y: number, sx: number, sy: number) =>
    `<g transform="translate(${x} ${y}) scale(${sx} ${sy})" fill="none" stroke="${GOLD_ART}" stroke-width="5" stroke-linecap="round">
      <path d="M8,8 L60,8 M8,8 L8,60"/>
      <path d="M18,18 q40,4 46,44"/>
      <circle cx="26" cy="24" r="3.5" fill="${GOLD_ART}" stroke="none"/>
      <circle cx="48" cy="18" r="2.5" fill="${GOLD_ART}" stroke="none"/>
      <circle cx="18" cy="48" r="2.5" fill="${GOLD_ART}" stroke="none"/>
    </g>`;
  const bolt = (x: number, y: number) =>
    `<circle cx="${x}" cy="${y}" r="9" fill="#cfd4d8" stroke="#9aa0a6" stroke-width="2"/><circle cx="${x - 2}" cy="${y - 2}" r="2.5" fill="#eef1f3"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
    ${corner(L, T, 1, 1)}${corner(R, T, -1, 1)}${corner(L, B, 1, -1)}${corner(R, B, -1, -1)}
    ${bolt(L + 16, T + 16)}${bolt(R - 16, T + 16)}${bolt(L + 16, B - 16)}${bolt(R - 16, B - 16)}
  </svg>`;
}

function flowerSvg(x: number, y: number, r: number, petal: string): string {
  let p = "";
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
    p += `<circle cx="${(x + Math.cos(a) * r).toFixed(1)}" cy="${(y + Math.sin(a) * r).toFixed(1)}" r="${(r * 0.62).toFixed(1)}" fill="${petal}"/>`;
  }
  return `${p}<circle cx="${x}" cy="${y}" r="${(r * 0.5).toFixed(1)}" fill="#f2c14e"/>`;
}

/** A floral ring (top and bottom arcs) and two bolts for the round plate. */
function floralRingOverlaySvg(): string {
  const cx = 400, cy = 400, R = 250;
  const arc: string[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    // Only the top and bottom thirds carry flowers; the sides stay clear.
    const deg = (a * 180) / Math.PI;
    if ((deg > 200 && deg < 340) || (deg > 20 && deg < 160)) {
      const x = cx + Math.cos(a) * R;
      const y = cy + Math.sin(a) * R;
      arc.push(flowerSvg(x, y, 15, i % 2 ? "#e08aa0" : "#8bb37a"));
    }
  }
  const bolt = (x: number) =>
    `<circle cx="${x}" cy="${cy}" r="10" fill="#cfd4d8" stroke="#9aa0a6" stroke-width="2"/><circle cx="${x - 2}" cy="${cy - 2}" r="3" fill="#eef1f3"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">${arc.join("")}${bolt(cx - R - 4)}${bolt(cx + R + 4)}</svg>`;
}

/** Card mock of the vertical acrylic plate. */
function verticalCardSvg(o: { plaque: string; text: string; names: string[]; sub: string }): string {
  const lines = o.names
    .map((n, i) => `<text x="400" y="${300 + i * 78}" font-family="Georgia, serif" font-size="60" font-weight="700" fill="${o.text}" text-anchor="middle">${esc(n)}</text>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
  <rect width="800" height="800" fill="#eceef1"/>
  <rect x="240" y="96" width="320" height="608" rx="14" fill="${o.plaque}"/>
  ${lines}
  <text x="400" y="${300 + o.names.length * 78 + 30}" font-family="Georgia, serif" font-size="30" letter-spacing="2" fill="${o.text}" fill-opacity="0.85" text-anchor="middle">${esc(o.sub.toUpperCase())}</text>
  ${goldCornersOverlaySvg().replace(/^<svg[^>]*>|<\/svg>$/g, "")}
</svg>`;
}

/** Card mock of the round acrylic plate. */
function roundCardSvg(o: { plaque: string; text: string; houseNo: string; name: string; family: string }): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">
  <rect width="800" height="800" fill="#eceef1"/>
  <circle cx="400" cy="400" r="280" fill="${o.plaque}"/>
  <text x="400" y="290" font-family="Georgia, serif" font-size="40" fill="${o.text}" text-anchor="middle">${esc(o.houseNo)}</text>
  <text x="400" y="430" font-family="Georgia, serif" font-size="104" font-weight="700" fill="${o.text}" text-anchor="middle">${esc(o.name)}</text>
  <text x="400" y="520" font-family="'Brush Script MT', cursive" font-size="52" fill="${o.text}" text-anchor="middle">${esc(o.family)}</text>
  ${floralRingOverlaySvg().replace(/^<svg[^>]*>|<\/svg>$/g, "")}
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
  /** Optional engraved-edge colour for a premium plate look. */
  edge?: string | null;
  frameColors: string[];
  textColors: string[];
  fonts: string[];
  defaultFont: string;
  namePlaceholder: string;
  subPlaceholder: string;
}): CustomizerConfig {
  /* A name plate is wide (roughly 1:2.6), so the plaque is a broad band across
     the middle of the square canvas. The name sits large and centred, the
     address line small below it. An optional engraved edge frames the plate. */
  const zones = [
    {
      id: "plaque",
      kind: "FRAME" as const,
      label: "Plate",
      x: 6,
      y: 33,
      width: 88,
      height: 34,
      cornerRadius: 16,
      fill: o.plaque,
      tintByFrameColor: true,
      required: false,
    },
    ...(o.edge
      ? [
          {
            id: "edge",
            kind: "FRAME" as const,
            label: "Edge",
            x: 8.5,
            y: 36,
            width: 83,
            height: 28,
            cornerRadius: 12,
            fill: null,
            stroke: o.edge,
            strokeWidth: 3,
            tintByFrameColor: false,
            required: false,
          },
        ]
      : []),
    {
      id: "name",
      kind: "TEXT" as const,
      label: "Name",
      x: 10,
      y: 37,
      width: 80,
      height: 17,
      fontSizePct: 64,
      color: o.textColors[0],
      align: "center" as const,
      defaultText: o.namePlaceholder,
      maxChars: 24,
      required: true,
    },
    {
      id: "sub",
      kind: "TEXT" as const,
      label: "Address / society",
      x: 10,
      y: 56,
      width: 80,
      height: 7,
      fontSizePct: 26,
      color: o.textColors[0],
      align: "center" as const,
      defaultText: o.subPlaceholder,
      maxChars: 44,
      required: false,
    },
  ];
  return customizerConfigSchema.parse({
    enabled: true,
    templateName: o.templateName,
    colorNotice: true,
    views: [{ id: "front", label: "Front", base: o.base, zoneIds: zones.map((z) => z.id) }],
    zones,
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
    /* A portrait frame (roughly 2:3) with a thin coloured border, a white mat,
       the photo in the upper two-thirds and the names + date beneath it. */
    zones: [
      {
        id: "frame",
        kind: "FRAME",
        label: "Frame",
        x: 24,
        y: 6,
        width: 52,
        height: 88,
        cornerRadius: 2,
        fill: o.frameColors[0],
        tintByFrameColor: true,
        required: false,
      },
      {
        id: "mat",
        kind: "FRAME",
        label: "Mat",
        x: 27,
        y: 9,
        width: 46,
        height: 82,
        cornerRadius: 1,
        fill: "#ffffff",
        tintByFrameColor: false,
        required: false,
      },
      {
        id: "photo",
        kind: "PHOTO",
        label: "Your photo",
        x: 31,
        y: 20,
        width: 38,
        height: 44,
        printWidthMm: 150,
        printHeightMm: 170,
        minDpi: 150,
        required: true,
      },
      {
        id: "names",
        kind: "TEXT",
        label: "Names",
        x: 29,
        y: 69,
        width: 42,
        height: 8,
        fontSizePct: 52,
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
        x: 29,
        y: 79,
        width: 42,
        height: 5,
        fontSizePct: 32,
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

/** The size / thickness / mounting price options shared by every name plate. */
const NAMEPLATE_OPTIONS = [
  {
    id: "size",
    label: "Size",
    kind: "CHOICE" as const,
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
    kind: "CHOICE" as const,
    options: [
      { id: "t3", label: "3 mm", priceDeltaP: 0 },
      { id: "t5", label: "5 mm", priceDeltaP: 15000 },
      { id: "t8", label: "8 mm", priceDeltaP: 35000 },
    ],
  },
  {
    id: "mount",
    label: "Mounting",
    kind: "CHOICE" as const,
    helpText: "How the plate fixes to your wall or door.",
    options: [
      { id: "tape", label: "Double-sided tape", priceDeltaP: 0 },
      { id: "holes", label: "Holes only", priceDeltaP: 0 },
      { id: "screws", label: "Holes with screws", priceDeltaP: 5000 },
    ],
  },
];

/** A wave-cut dual-tone wooden plate. The wood look is baked into the base, so
 *  the customer changes wording, font and size — not the plate colour. */
function waveCutConfig(o: { templateName: string; base: string; fonts: string[]; defaultFont: string }): CustomizerConfig {
  return customizerConfigSchema.parse({
    enabled: true,
    templateName: o.templateName,
    colorNotice: true,
    views: [{ id: "front", label: "Front", base: o.base, zoneIds: ["name", "subs"] }],
    zones: [
      { id: "name", kind: "TEXT", label: "Name", x: 10, y: 33, width: 80, height: 13, fontSizePct: 74, color: "#5a2f18", align: "center", defaultText: "Your Name", maxChars: 18, required: true },
      { id: "subs", kind: "TEXT", label: "Family names", x: 10, y: 55, width: 80, height: 9, fontSizePct: 40, color: "#f4e7cf", align: "center", defaultText: "Family Names", maxChars: 40, required: false },
    ],
    optionGroups: NAMEPLATE_OPTIONS,
    customerOptions: {
      font: { enabled: true, families: o.fonts.map(font), default: o.defaultFont },
      textSize: { enabled: true, choices: SIZE_TEXTS, default: 24 },
    },
  });
}

/** A vertical (portrait) acrylic plate with gold corner flourishes. */
function verticalPlateConfig(o: {
  templateName: string;
  base: string;
  overlay: string;
  plaque: string;
  frameColors: string[];
  textColors: string[];
  fonts: string[];
  defaultFont: string;
}): CustomizerConfig {
  return customizerConfigSchema.parse({
    enabled: true,
    templateName: o.templateName,
    colorNotice: true,
    views: [{ id: "front", label: "Front", base: o.base, overlay: o.overlay, zoneIds: ["plaque", "name", "sub"] }],
    zones: [
      { id: "plaque", kind: "FRAME", label: "Plate", x: 30, y: 12, width: 40, height: 76, cornerRadius: 6, fill: o.plaque, tintByFrameColor: true, required: false },
      { id: "name", kind: "TEXT", label: "Name", x: 31, y: 30, width: 38, height: 22, fontSizePct: 42, color: o.textColors[0], align: "center", defaultText: "Your Name", maxChars: 20, required: true },
      { id: "sub", kind: "TEXT", label: "City / title", x: 31, y: 66, width: 38, height: 8, fontSizePct: 28, color: o.textColors[1] ?? o.textColors[0], align: "center", defaultText: "Your City", maxChars: 30, required: false },
    ],
    optionGroups: NAMEPLATE_OPTIONS,
    customerOptions: {
      frameColor: { enabled: true, colors: o.frameColors, default: o.plaque },
      textColor: { enabled: true, colors: o.textColors, default: o.textColors[0] },
      font: { enabled: true, families: o.fonts.map(font), default: o.defaultFont },
      textSize: { enabled: true, choices: SIZE_TEXTS, default: 24 },
    },
  });
}

/** A round acrylic plate with a floral border. */
function roundPlateConfig(o: {
  templateName: string;
  base: string;
  overlay: string;
  plaque: string;
  frameColors: string[];
  textColors: string[];
  fonts: string[];
  defaultFont: string;
}): CustomizerConfig {
  return customizerConfigSchema.parse({
    enabled: true,
    templateName: o.templateName,
    colorNotice: true,
    views: [{ id: "front", label: "Front", base: o.base, overlay: o.overlay, zoneIds: ["plaque", "houseNo", "name", "family"] }],
    zones: [
      { id: "plaque", kind: "FRAME", label: "Plate", shape: "CIRCLE", x: 15, y: 15, width: 70, height: 70, fill: o.plaque, tintByFrameColor: true, required: false },
      { id: "houseNo", kind: "TEXT", label: "Flat / house no.", x: 30, y: 30, width: 40, height: 8, fontSizePct: 44, color: o.textColors[0], align: "center", defaultText: "G-000", maxChars: 12, required: false },
      { id: "name", kind: "TEXT", label: "Name", x: 20, y: 42, width: 60, height: 16, fontSizePct: 62, color: o.textColors[0], align: "center", defaultText: "NAME", maxChars: 14, required: true },
      { id: "family", kind: "TEXT", label: "Family / title", x: 25, y: 60, width: 50, height: 9, fontSizePct: 48, color: o.textColors[0], align: "center", defaultText: "Family", maxChars: 20, required: false },
    ],
    optionGroups: NAMEPLATE_OPTIONS,
    customerOptions: {
      frameColor: { enabled: true, colors: o.frameColors, default: o.plaque },
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

const GOLD = "#c9a24a";
const PLATE_TEXT_COLORS = ["#ffffff", "#f2c14e", "#ee722e", "#facba8"];
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
      edge: GOLD,
      frameColors: PLATE_FRAME_COLORS,
      textColors: PLATE_TEXT_COLORS,
      fonts: ["Poppins", "Montserrat", "Playfair Display"],
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
      edge: GOLD,
      frameColors: [WOOD, BLACK, "#5c260c", NAVY],
      textColors: ["#0f121f", "#ffffff", "#5c260c", "#8a3a12"],
      fonts: ["Playfair Display", "Cinzel", "Great Vibes"],
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
      fonts: ["Great Vibes", "Playfair Display", "Poppins"],
      defaultFont: "Great Vibes",
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
      fonts: ["Great Vibes", "Dancing Script", "Pacifico"],
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
      fonts: ["Great Vibes", "Dancing Script", "Playfair Display"],
      defaultFont: "Great Vibes",
      namesPlaceholder: "Name & Name",
      datePlaceholder: "01.01.2025",
    }),
  },
  {
    name: "WaveCut Dual-Tone Wooden Name Plate",
    sku: "SR-FD-07",
    categorySlug: "wooden-name-plates",
    short: "A dual-tone wooden plate with a flowing wave-cut divide — your family name on top, everyone's names below.",
    price: 1199,
    sale: 749,
    material: "Wood",
    color: "Dual-tone wood",
    size: "6×12 in and up",
    occasion: "Housewarming",
    tags: ["name plate", "wooden", "wave", "dual tone", "personalised"],
    card: "fd-wavecut",
    config: waveCutConfig({
      templateName: "WaveCut Wooden Plate",
      base: "/placeholders/fd-wavecut-base.svg",
      fonts: ["Poppins", "Playfair Display", "Great Vibes"],
      defaultFont: "Poppins",
    }),
  },
  {
    name: "Golden Floral Vertical Name Plate",
    sku: "SR-FD-08",
    categorySlug: "acrylic-name-plates",
    short: "A tall black acrylic plate with gold floral corners — set your family name and city in a finish you choose.",
    price: 849,
    sale: 549,
    material: "Acrylic",
    color: "Black",
    size: "6×9 in and up",
    occasion: "Housewarming",
    tags: ["name plate", "acrylic", "vertical", "floral", "golden"],
    card: "fd-vertical",
    config: verticalPlateConfig({
      templateName: "Golden Floral Plate",
      base: "/placeholders/fd-backdrop.svg",
      overlay: "/placeholders/fd-gold-corners.svg",
      plaque: BLACK,
      frameColors: [BLACK, "#ffffff", WOOD, NAVY],
      textColors: ["#ffffff", "#f2c14e", "#facba8", "#ee722e"],
      fonts: ["Playfair Display", "Poppins", "Great Vibes"],
      defaultFont: "Playfair Display",
    }),
  },
  {
    name: "Round Floral Home Name Plate",
    sku: "SR-FD-09",
    categorySlug: "custom-name-plates",
    short: "A round wooden plate with a floral border — house number, family name and a title, arranged on a circle.",
    price: 899,
    sale: 649,
    material: "Acrylic on wood finish",
    color: "Wood",
    size: "8 in round and up",
    occasion: "Housewarming",
    tags: ["name plate", "round", "floral", "acrylic", "personalised"],
    card: "fd-round",
    config: roundPlateConfig({
      templateName: "Round Floral Plate",
      base: "/placeholders/fd-backdrop.svg",
      overlay: "/placeholders/fd-floral-ring.svg",
      plaque: WOOD,
      frameColors: [WOOD, BLACK, "#5c260c", "#3a2412"],
      textColors: ["#ffffff", "#f2c14e", "#facba8"],
      fonts: ["Great Vibes", "Playfair Display", "Poppins"],
      defaultFont: "Great Vibes",
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
  placeholders["fd-mandala"] = plateCardSvg({ plaque: BLACK, text: "#ffffff", edge: GOLD, name: "Ravi's", sub: "Ram Vihar" });
  placeholders["fd-peacock"] = plateCardSvg({ plaque: WOOD, text: "#0f121f", edge: GOLD, name: "Krishna", sub: "Flat B-204" });
  placeholders["fd-modern"] = plateCardSvg({ plaque: "#efe7d8", text: "#5c260c", name: "Welcome", sub: "The Sharmas" });
  placeholders["fd-couple"] = frameCardSvg({ frame: BLACK, names: "Kunal & Divya", date: "12.04.2023" });
  placeholders["fd-social"] = frameCardSvg({ frame: BLACK, names: "@lovegram", date: "Est. 2025" });
  placeholders["fd-lovebirds"] = frameCardSvg({ frame: BLACK, names: "Ronnie & Natalie", date: "08.09.1999" });
  // Wave-cut wooden plate: base (for the customizer) and a card mock.
  placeholders["fd-wavecut-base"] = waveCutBaseSvg();
  placeholders["fd-wavecut"] = waveCutBaseSvg({ name: "Bajwa", subs: "Deva, Bharat, Palak" });
  // Vertical acrylic plate: gold-corner overlay and a card mock.
  placeholders["fd-gold-corners"] = goldCornersOverlaySvg();
  placeholders["fd-vertical"] = verticalCardSvg({ plaque: BLACK, text: "#ffffff", names: ["Shiv", "Paru", "Ravi"], sub: "Jaipur" });
  // Round acrylic plate: floral-ring overlay and a card mock.
  placeholders["fd-floral-ring"] = floralRingOverlaySvg();
  placeholders["fd-round"] = roundCardSvg({ plaque: WOOD, text: "#ffffff", houseNo: "G-202", name: "RAVI'S", family: "Family" });
  writePlaceholders(placeholders);
  console.log(`Wrote ${Object.keys(placeholders).length} placeholder SVGs.`);

  // --dry writes the artwork only, so it can be previewed before any product
  // is created or updated in the database.
  if (process.argv.includes("--dry")) {
    console.log("Dry run — wrote artwork only, database untouched.");
    process.exit(0);
  }

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
    let isNew = false;
    if (existing) {
      await db.update(products).set(values).where(eq(products.id, existing.id));
      productId = existing.id;
      console.log(`  updated  ${def.name}  (images left as-is)`);
    } else {
      const [row] = await db
        .insert(products)
        .values({ ...values, sku: def.sku })
        .returning({ id: products.id });
      productId = row.id;
      isNew = true;
      console.log(`  created  ${def.name}`);
    }

    /* Only set the placeholder image when the product is first created — a
       re-run must never clobber a real photograph an admin uploaded later. */
    if (isNew) {
      await db.insert(productImages).values([
        { productId, url: `/placeholders/${def.card}.svg`, alt: def.name, position: 0, isPrimary: true },
      ]);
    }
  }

  console.log("\nDone. Personalise them in the Frame Designer at /admin/products/<id>/customizer.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
