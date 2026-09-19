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

export const designSchema = z.object({
  /** The configuration version this design was built against. An order keeps
   *  its own copy, so republishing the product cannot rewrite history (§39). */
  configVersion: z.number().int().min(1),
  /** The view the customer was last looking at, restored when they return. */
  viewId: z.string().max(64),
  zones: z.record(z.string().max(64), zoneValueSchema).default({}),
});
export type CustomerDesign = z.infer<typeof designSchema>;

/** A design that is present but empty — used when a customer opens a
 *  customisable product before touching anything. */
export function emptyDesign(configVersion: number, viewId: string): CustomerDesign {
  return { configVersion, viewId, zones: {} };
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
  return `${design.configVersion}#${zones}`;
}

/** Whether the customer has put anything in at all. */
export function isDesignEmpty(design: CustomerDesign | null): boolean {
  if (!design) return true;
  return Object.values(design.zones).every((value) =>
    value.kind === "TEXT" ? value.text.value.trim() === "" : false,
  );
}
