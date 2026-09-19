import { z } from "zod";

/**
 * The product customizer configuration.
 *
 * One versioned document per product, stored on `products.customizer`. It
 * describes what the customer may do, never what any single product is — a
 * photo frame, an LED lamp and a keychain are all the same shape of document
 * with different views, zones and tools. Nothing here is product-specific.
 *
 * Coordinates are PERCENTAGES of the view image, not pixels. That is what lets
 * the same configuration drive a 320px phone preview, a 700px desktop preview
 * and a 4000px production render without a second set of numbers.
 *
 * `version` is bumped whenever the admin republishes. A cart or order snapshot
 * records the version it was built against, so editing a product later cannot
 * reach back and change what a customer already approved.
 */

export const CUSTOMIZER_VERSION = 1;

/** A zone's outline. Rectangles cover most products; circles are common for
 *  keychains and clock faces. Polygon is reserved and not yet rendered. */
export const zoneShapeSchema = z.enum(["RECT", "CIRCLE"]);
export type ZoneShape = z.infer<typeof zoneShapeSchema>;

export const zoneKindSchema = z.enum(["PHOTO", "TEXT"]);
export type ZoneKind = z.infer<typeof zoneKindSchema>;

const percent = z.number().min(0).max(100);

/**
 * An editable region drawn over a product view.
 *
 * x/y are the top-left corner as a percentage of the view; width/height are
 * percentages too. `safeInset` is the margin inside the zone that printing is
 * guaranteed to reach — the customer's content may fill the whole zone, but a
 * warning is shown when something important falls outside the safe area.
 */
export const zoneSchema = z.object({
  id: z.string().min(1).max(64),
  kind: zoneKindSchema,
  label: z.string().trim().min(1).max(80),
  shape: zoneShapeSchema.default("RECT"),

  x: percent,
  y: percent,
  width: percent.refine((v) => v > 0, "A zone needs a width."),
  height: percent.refine((v) => v > 0, "A zone needs a height."),
  rotation: z.number().min(-180).max(180).default(0),
  /** Rounded corners, as a percentage of the zone's shorter side. */
  cornerRadius: z.number().min(0).max(50).default(0),
  /** Percentage of the zone reserved as safe area on every edge. */
  safeInset: z.number().min(0).max(25).default(0),

  required: z.boolean().default(true),

  /** PHOTO zones only: the printable size this zone maps to, used to judge
   *  whether an uploaded photo has enough pixels. */
  printWidthMm: z.number().positive().max(5000).nullable().default(null),
  printHeightMm: z.number().positive().max(5000).nullable().default(null),
  minDpi: z.number().min(30).max(1200).default(150),

  /** TEXT zones only. */
  maxChars: z.number().int().min(1).max(500).nullable().default(null),
  defaultText: z.string().max(500).default(""),
  fontFamily: z.string().max(80).default("Inter"),
  fontSizePct: z.number().min(1).max(100).default(12),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0f121f"),
  align: z.enum(["left", "center", "right"]).default("center"),
});
export type CustomizerZone = z.infer<typeof zoneSchema>;

/**
 * One angle or state of the product: Front, Back, Light off, Light on, Room.
 *
 * `base` sits under the customer's content and `overlay` sits on top, which is
 * what makes a frame look like it is in front of the photo rather than beside
 * it. `glow` is composited with screen blending for illuminated products.
 */
export const viewSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().trim().min(1).max(60),
  /** Image URL served by the existing media route. */
  base: z.string().trim().max(500),
  overlay: z.string().trim().max(500).default(""),
  glow: z.string().trim().max(500).default(""),
  /** Zones are per view, so the front and back can be edited independently. */
  zoneIds: z.array(z.string().max(64)).default([]),
  /** Marks this view as the illuminated state of the product. */
  isLit: z.boolean().default(false),
});
export type CustomizerView = z.infer<typeof viewSchema>;

/** Which controls the customer is shown. A simple product should not display
 *  tools it has no use for (§54). */
export const toolsSchema = z.object({
  photoUpload: z.boolean().default(true),
  zoom: z.boolean().default(true),
  rotate: z.boolean().default(true),
  flip: z.boolean().default(false),
  text: z.boolean().default(true),
  undoRedo: z.boolean().default(true),
  fullscreenPreview: z.boolean().default(true),
});
export type CustomizerTools = z.infer<typeof toolsSchema>;

/**
 * A choice the customer makes that is not content: frame colour, acrylic
 * thickness, size, LED colour.
 *
 * One shape covers all of them. A swatch renders as a colour circle, a size or
 * material as a labelled pill, and an LED option additionally tints the glow
 * layer — but they are the same record, so adding "border colour" later needs
 * no new code on either side.
 */
export const optionSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().trim().min(1).max(60),
  /** Swatch colour, and the tint applied to a glow layer for LED groups. */
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null),
  /** Added to the line price, in paise. May be zero. */
  priceDeltaP: z.number().int().min(-1_000_000).max(1_000_000).default(0),
  /** Shown but not selectable, e.g. a size that is out of stock. */
  available: z.boolean().default(true),
  /** Carried onto the order so the workshop knows what to pull. */
  sku: z.string().trim().max(64).default(""),
});
export type CustomizerOption = z.infer<typeof optionSchema>;

export const optionGroupKindSchema = z.enum(["SWATCH", "CHOICE", "LED"]);
export type OptionGroupKind = z.infer<typeof optionGroupKindSchema>;

export const optionGroupSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().trim().min(1).max(60),
  /** SWATCH shows colour circles, CHOICE shows labelled pills, LED does both
   *  and tints the glow layer of any lit view. */
  kind: optionGroupKindSchema.default("CHOICE"),
  required: z.boolean().default(true),
  helpText: z.string().trim().max(160).default(""),
  options: z.array(optionSchema).min(1).max(40),
});
export type CustomizerOptionGroup = z.infer<typeof optionGroupSchema>;

export const customizerConfigSchema = z.object({
  enabled: z.boolean().default(false),
  version: z.number().int().min(1).default(CUSTOMIZER_VERSION),
  views: z.array(viewSchema).min(1, "Add at least one product view.").max(12),
  zones: z.array(zoneSchema).max(24).default([]),
  optionGroups: z.array(optionGroupSchema).max(12).default([]),
  tools: toolsSchema.default(() => toolsSchema.parse({})),
  /** Added to the line price when the customer personalises, in paise. */
  customizationFeeP: z.number().int().min(0).max(1_000_000).default(0),
  /** Blocks add-to-cart on a low-resolution photo rather than only warning. */
  strictQuality: z.boolean().default(false),
  /** Shown under the preview on printed products (§35). */
  colorNotice: z.boolean().default(false),
});

export type CustomizerConfig = z.infer<typeof customizerConfigSchema>;

/** A product with no configuration behaves exactly as it always did. */
export const EMPTY_CONFIG: CustomizerConfig = {
  enabled: false,
  version: CUSTOMIZER_VERSION,
  views: [],
  zones: [],
  optionGroups: [],
  tools: {
    photoUpload: true,
    zoom: true,
    rotate: true,
    flip: false,
    text: true,
    undoRedo: true,
    fullscreenPreview: true,
  },
  customizationFeeP: 0,
  strictQuality: false,
  colorNotice: false,
};

/**
 * Reads a stored configuration without throwing.
 *
 * A row written by an older version, or by hand, must not be able to break a
 * product page — an unreadable configuration means "not customisable", which
 * is the same safe state as never having configured one.
 */
export function readConfig(raw: unknown): CustomizerConfig {
  if (!raw) return EMPTY_CONFIG;
  const parsed = customizerConfigSchema.safeParse(raw);
  if (!parsed.success) return EMPTY_CONFIG;
  if (!parsed.data.enabled || parsed.data.views.length === 0) {
    return { ...parsed.data, enabled: false };
  }
  return parsed.data;
}

/** The zones belonging to one view, in configuration order. */
export function zonesForView(config: CustomizerConfig, viewId: string): CustomizerZone[] {
  const view = config.views.find((v) => v.id === viewId);
  if (!view) return [];
  return view.zoneIds
    .map((id) => config.zones.find((z) => z.id === id))
    .filter((z): z is CustomizerZone => Boolean(z));
}

/** Every zone the customer must fill for the design to be complete. */
export function requiredZones(config: CustomizerConfig): CustomizerZone[] {
  const used = new Set(config.views.flatMap((v) => v.zoneIds));
  return config.zones.filter((z) => z.required && used.has(z.id));
}

/** The option a design has selected in a group, falling back to the first
 *  available one so a preview is never in an impossible state. */
export function resolveOption(
  group: CustomizerOptionGroup,
  selectedId: string | undefined,
): CustomizerOption | null {
  const chosen = group.options.find((o) => o.id === selectedId && o.available);
  return chosen ?? group.options.find((o) => o.available) ?? null;
}

/** The LED colour a design implies, used to tint the glow layer. */
export function ledTint(
  config: CustomizerConfig,
  selections: Record<string, string>,
): string | null {
  for (const group of config.optionGroups) {
    if (group.kind !== "LED") continue;
    const option = resolveOption(group, selections[group.id]);
    if (option?.hex) return option.hex;
  }
  return null;
}
