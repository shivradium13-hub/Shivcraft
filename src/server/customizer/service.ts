import { and, eq, inArray, isNull } from "drizzle-orm";

import {
  designSchema,
  type CustomerDesign,
  type PhotoPlacement,
} from "@/lib/customizer/design";
import {
  readConfig,
  requiredZones,
  resolveOption,
  type CustomizerConfig,
  type CustomizerZone,
} from "@/lib/customizer/schema";
import { ApiError } from "@/server/api/http";
import { db } from "@/server/db";
import { products, uploads } from "@/server/db/schema";

/**
 * Server-side authority for the customizer.
 *
 * Nothing here trusts the browser. The design that arrives with an add-to-cart
 * is re-validated against the product's own configuration, the uploads it
 * points at are checked for ownership, and the price is recomputed from the
 * configuration rather than read from the request (§28, §43, §48).
 */

export async function getProductConfig(productId: string): Promise<CustomizerConfig> {
  const rows = await db
    .select({ customizer: products.customizer })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  return readConfig(rows[0]?.customizer);
}

export type QualityVerdict = "EXCELLENT" | "GOOD" | "LOW" | "VERY_LOW" | "UNKNOWN";

/**
 * How well an uploaded photo covers the printable area of its zone.
 *
 * Worked out from the zone's real print size and the photo's natural pixels,
 * scaled by how far the customer has zoomed in — zooming in uses fewer of the
 * photo's pixels across the same printed area, which is exactly when a picture
 * starts to look soft.
 */
export function photoQuality(zone: CustomizerZone, placement: PhotoPlacement): {
  verdict: QualityVerdict;
  dpi: number | null;
} {
  if (!zone.printWidthMm || !zone.printHeightMm) return { verdict: "UNKNOWN", dpi: null };
  if (!placement.naturalWidth || !placement.naturalHeight) return { verdict: "UNKNOWN", dpi: null };

  const scale = Math.max(0.1, placement.scale);
  const usableWidth = placement.naturalWidth / scale;
  const usableHeight = placement.naturalHeight / scale;

  const dpiX = usableWidth / (zone.printWidthMm / 25.4);
  const dpiY = usableHeight / (zone.printHeightMm / 25.4);
  const dpi = Math.round(Math.min(dpiX, dpiY));

  const target = zone.minDpi;
  const verdict: QualityVerdict =
    dpi >= target * 1.5 ? "EXCELLENT" : dpi >= target ? "GOOD" : dpi >= target * 0.6 ? "LOW" : "VERY_LOW";

  return { verdict, dpi };
}

export type DesignIssue = { zoneId: string | null; message: string };

/**
 * Checks a design against the product's configuration.
 *
 * Returns written problems rather than a flat rejection, because "Invalid
 * configuration" tells a customer nothing about what to fix (§40, §57).
 */
export async function validateDesign(options: {
  config: CustomizerConfig;
  design: CustomerDesign;
  /** Who is adding to cart, so upload ownership can be checked. */
  userId: string | null;
  guestToken: string | null;
}): Promise<{ issues: DesignIssue[]; uploadIds: string[] }> {
  const { config, design } = options;
  const issues: DesignIssue[] = [];

  if (!config.enabled) {
    return { issues: [{ zoneId: null, message: "This product is not customisable." }], uploadIds: [] };
  }

  const byId = new Map(config.zones.map((z) => [z.id, z]));
  const uploadIds: string[] = [];

  for (const [zoneId, value] of Object.entries(design.zones)) {
    const zone = byId.get(zoneId);
    if (!zone) {
      // A zone the product no longer has. Dropped rather than failed, so an
      // admin removing a zone does not strand a customer mid-design.
      continue;
    }

    if (value.kind === "PHOTO") {
      if (zone.kind !== "PHOTO") {
        issues.push({ zoneId, message: `${zone.label} does not take a photo.` });
        continue;
      }
      uploadIds.push(value.photo.uploadId);

      const { verdict } = photoQuality(zone, value.photo);
      if (config.strictQuality && (verdict === "LOW" || verdict === "VERY_LOW")) {
        issues.push({
          zoneId,
          message: `The photo in ${zone.label} is too small to print at this size. Please upload a larger one.`,
        });
      }
    } else {
      if (zone.kind !== "TEXT") {
        issues.push({ zoneId, message: `${zone.label} does not take text.` });
        continue;
      }
      const text = value.text.value.trim();
      if (zone.maxChars && text.length > zone.maxChars) {
        issues.push({
          zoneId,
          message: `${zone.label} can hold ${zone.maxChars} characters; you have ${text.length}.`,
        });
      }
    }
  }

  for (const zone of requiredZones(config)) {
    const value = design.zones[zone.id];
    const missing =
      !value ||
      (value.kind === "TEXT" && value.text.value.trim() === "") ||
      (value.kind === "PHOTO" && !value.photo.uploadId);

    if (missing) {
      issues.push({
        zoneId: zone.id,
        message:
          zone.kind === "PHOTO"
            ? `Add a photo for ${zone.label}.`
            : `Enter your ${zone.label.toLowerCase()}.`,
      });
    }
  }

  /* Option groups: a required group must be chosen, and a chosen option must
     exist and still be available. An option that has since sold out is named
     rather than silently swapped, because the price would change under the
     customer. */
  for (const group of config.optionGroups) {
    const selectedId = design.options[group.id];

    if (!selectedId) {
      if (group.required) {
        issues.push({ zoneId: group.id, message: `Choose a ${group.label.toLowerCase()}.` });
      }
      continue;
    }

    const option = group.options.find((o) => o.id === selectedId);
    if (!option) {
      issues.push({ zoneId: group.id, message: `That ${group.label.toLowerCase()} is no longer offered.` });
    } else if (!option.available) {
      issues.push({
        zoneId: group.id,
        message: `${option.label} is out of stock. Please pick another ${group.label.toLowerCase()}.`,
      });
    }
  }

  /* Every referenced upload must exist and belong to whoever is ordering.
     Without this a customer could put someone else's photo id in a design. */
  if (uploadIds.length > 0) {
    const owned = await db
      .select({ id: uploads.id })
      .from(uploads)
      .where(
        and(
          inArray(uploads.id, uploadIds),
          options.userId
            ? eq(uploads.userId, options.userId)
            : options.guestToken
              ? eq(uploads.guestToken, options.guestToken)
              : isNull(uploads.id),
        ),
      );

    const ownedIds = new Set(owned.map((row) => row.id));
    for (const id of uploadIds) {
      if (!ownedIds.has(id)) {
        issues.push({
          zoneId: null,
          message: "One of your photos is still uploading, or could not be found. Try uploading it again.",
        });
        break;
      }
    }
  }

  return { issues, uploadIds };
}

/**
 * What personalising adds to a line, in paise.
 *
 * The flat fee plus every selected option's delta, all read from the product's
 * stored configuration. The browser sends which options were chosen, never
 * what they cost (§28, §48).
 */
export function customizationFeeP(config: CustomizerConfig, design: CustomerDesign | null): number {
  if (!config.enabled || !design) return 0;

  let total = config.customizationFeeP;
  for (const group of config.optionGroups) {
    const option = resolveOption(group, design.options[group.id]);
    if (option) total += option.priceDeltaP;
  }
  return total;
}

/** A readable record of what was chosen, for the cart line and the order. */
export function describeOptions(
  config: CustomizerConfig,
  design: CustomerDesign,
): { label: string; value: string; sku: string; priceDeltaP: number }[] {
  return config.optionGroups.flatMap((group) => {
    const option = resolveOption(group, design.options[group.id]);
    return option
      ? [{ label: group.label, value: option.label, sku: option.sku, priceDeltaP: option.priceDeltaP }]
      : [];
  });
}

/** Parses a design off the wire, or throws a written error. */
export function parseDesign(raw: unknown): CustomerDesign {
  const parsed = designSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError("BAD_REQUEST", "That design could not be read. Please rebuild it and try again.");
  }
  return parsed.data;
}
