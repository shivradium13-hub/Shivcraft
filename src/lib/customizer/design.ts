import { z } from "zod";

/**
 * A customer's design: what they put into each zone, and how it sits there.
 *
 * Deliberately small, and deliberately *not* pixels. A photo zone stores the
 * upload it points at plus a transform — offset, scale, rotation — rather than
 * a re-cropped copy of the image. That means dragging and zooming never
 * re-uploads anything (§42), the original is kept at full resolution for
 * production (§34), and the same numbers reproduce the crop at any output size.
 *
 * offsetX/offsetY are percentages of the ZONE, measured from its centre, so a
 * design renders identically in a 320px preview and a 4000px print file.
 */

export const photoPlacementSchema = z.object({
  /** Row id in `uploads`. The file itself is served through /api/uploads/[id],
   *  which checks ownership on every request. */
  uploadId: z.string().uuid(),
  offsetX: z.number().min(-200).max(200).default(0),
  offsetY: z.number().min(-200).max(200).default(0),
  /** 1 = the photo exactly covers the zone's shorter side. */
  scale: z.number().min(0.1).max(8).default(1),
  rotation: z.number().min(-180).max(180).default(0),
  flipH: z.boolean().default(false),
  flipV: z.boolean().default(false),
  /** Natural pixel size, recorded at upload so print quality can be judged
   *  server-side rather than trusting a number from the browser. */
  naturalWidth: z.number().int().positive().max(20000).nullable().default(null),
  naturalHeight: z.number().int().positive().max(20000).nullable().default(null),
  /** Percentages, 100 being untouched. Stored as numbers rather than a baked
   *  image so the original stays pristine and the look is reproducible at
   *  print resolution. */
  brightness: z.number().min(50).max(150).default(100),
  contrast: z.number().min(50).max(150).default(100),
  saturation: z.number().min(0).max(200).default(100),
});
export type PhotoPlacement = z.infer<typeof photoPlacementSchema>;

export const textPlacementSchema = z.object({
  value: z.string().max(500),
  fontFamily: z.string().max(80).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  fontSizePct: z.number().min(1).max(100).optional(),
});
export type TextPlacement = z.infer<typeof textPlacementSchema>;

export const zoneValueSchema = z.union([
  z.object({ kind: z.literal("PHOTO"), photo: photoPlacementSchema }),
  z.object({ kind: z.literal("TEXT"), text: textPlacementSchema }),
]);
export type ZoneValue = z.infer<typeof zoneValueSchema>;

/**
 * The customer's global styling choices, each picked from a set the admin
 * allowed (§ Frame Designer, "Customer Options"). Every field is optional:
 * absent means "not chosen / not offered", and the renderer falls back to the
 * template's own defaults. The customer changes styling, never layout — the
 * positions and sizes of everything stay with the product's configuration.
 */
export const designStyleSchema = z.object({
  /** Hex, tints frame elements that follow the frame colour. */
  frameColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  /** Hex, applied to every text box. */
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  /** A family name from the allowed fonts. */
  fontFamily: z.string().max(80).optional(),
  /** A px value from the allowed fixed sizes; scales the text proportionally. */
  textSizePx: z.number().int().min(6).max(200).optional(),
  /** Customer's gradient on/off, only meaningful when the admin enabled it. */
  gradientOn: z.boolean().optional(),
  /** Customer's LED glow on/off, only meaningful when the admin enabled it. */
  ledOn: z.boolean().optional(),
});
export type DesignStyle = z.infer<typeof designStyleSchema>;

export const designSchema = z.object({
  /** The configuration version this design was built against. An order keeps
   *  its own copy, so republishing the product cannot rewrite history (§39). */
  configVersion: z.number().int().min(1),
  /** The view the customer was last looking at, restored when they return. */
  viewId: z.string().max(64),
  zones: z.record(z.string().max(64), zoneValueSchema).default({}),
  /** { optionGroupId: optionId } — colour, size, material, LED colour. */
  options: z.record(z.string().max(64), z.string().max(64)).default({}),
  /** Global styling the customer chose from the admin's allowed sets. */
  style: designStyleSchema.default({}),
});
export type CustomerDesign = z.infer<typeof designSchema>;

/** A design that is present but empty — used when a customer opens a
 *  customisable product before touching anything. */
export function emptyDesign(configVersion: number, viewId: string): CustomerDesign {
  return { configVersion, viewId, zones: {}, options: {}, style: {} };
}

/**
 * A stable fingerprint of a design.
 *
 * Two cart lines for the same product must stay separate when the designs
 * differ and merge only when they are genuinely identical (§29). Comparing a
 * canonical string is enough and avoids storing a second hash column.
 */
export function designFingerprint(design: CustomerDesign | null): string {
  if (!design) return "";
  const zones = Object.keys(design.zones)
    .sort()
    .map((key) => {
      const value = design.zones[key];
      if (value.kind === "PHOTO") {
        const p = value.photo;
        return `${key}:P:${p.uploadId}:${p.offsetX.toFixed(2)}:${p.offsetY.toFixed(2)}:${p.scale.toFixed(3)}:${p.rotation}:${p.flipH ? 1 : 0}${p.flipV ? 1 : 0}`;
      }
      const t = value.text;
      return `${key}:T:${t.value}:${t.fontFamily ?? ""}:${t.color ?? ""}:${t.align ?? ""}:${t.fontSizePct ?? ""}`;
    })
    .join("|");
  const options = Object.keys(design.options)
    .sort()
    .map((key) => `${key}=${design.options[key]}`)
    .join(",");
  const s = design.style ?? {};
  const style = [
    s.frameColor ?? "",
    s.textColor ?? "",
    s.fontFamily ?? "",
    s.textSizePx ?? "",
    s.gradientOn ? 1 : 0,
    s.ledOn ? 1 : 0,
  ].join(":");
  return `${design.configVersion}#${zones}#${options}#${style}`;
}

/** Whether the customer has put anything in at all. */
export function isDesignEmpty(design: CustomerDesign | null): boolean {
  if (!design) return true;
  return Object.values(design.zones).every((value) =>
    value.kind === "TEXT" ? value.text.value.trim() === "" : false,
  );
}

/**
 * What an order freezes.
 *
 * A design on its own is not enough to reproduce what the customer approved:
 * it names zones, and the zones themselves — where they sit, how big they
 * print — live in the product's configuration, which the admin may change
 * afterwards. So an order keeps both, and the workshop renders the order
 * against the configuration that was live when it was placed (§32, §39).
 */
export const designSnapshotSchema = z.object({
  design: designSchema,
  /** The configuration as published at checkout. Typed loosely here to avoid
   *  a cycle with the config schema; parsed with readConfig where it is used. */
  config: z.unknown(),
});
export type DesignSnapshot = z.infer<typeof designSnapshotSchema>;

/**
 * Reads whatever is stored on a cart or order line.
 *
 * Accepts both the wrapper an order freezes and a bare design, which is what a
 * cart line holds and what the earliest order rows contain.
 */
export function readStoredDesign(raw: unknown): { design: CustomerDesign; config: unknown } | null {
  if (!raw) return null;

  const wrapped = designSnapshotSchema.safeParse(raw);
  if (wrapped.success) return { design: wrapped.data.design, config: wrapped.data.config };

  const bare = designSchema.safeParse(raw);
  if (bare.success) return { design: bare.data, config: null };

  return null;
}
