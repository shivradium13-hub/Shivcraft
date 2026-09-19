import { inArray } from "drizzle-orm";

import { db } from "@/server/db";
import { settings } from "@/server/db/schema";

/**
 * Shop settings, stored one JSON row per key.
 *
 * Only values that something actually reads live here. A field in this file is
 * a field the storefront honours — adding one to the admin form without a
 * reader would be a control that does nothing.
 *
 *   shipping  -> cart totals, the PIN-code delivery check
 *   tax       -> cart totals
 *   support   -> the /support page and the footer
 */

export type ShippingSettings = {
  /** Charged when the order is below the free-shipping threshold. Paise. */
  flatRateP: number;
  /** Order value at or above which delivery is free. Paise. */
  freeAboveP: number;
  /** Where parcels leave from; the delivery estimate counts regions from here. */
  originPincode: string;
  /** Whether cash on delivery is offered at all. */
  codEnabled: boolean;
};

export type TaxSettings = {
  gstPercent: number;
  /**
   * True when catalogue prices already contain GST, which is the usual Indian
   * retail convention. False adds it on top at checkout, and the customer sees
   * a separate tax line.
   */
  pricesIncludeTax: boolean;
};

export type SupportSettings = {
  email: string;
  phone: string;
  /** Free text, e.g. "Mon–Sat, 10am–7pm". */
  hours: string;
  whatsapp: string;
};

export type ShopSettings = ShippingSettings & TaxSettings;

export const DEFAULT_SHIPPING: ShippingSettings = {
  flatRateP: 5900,
  freeAboveP: 99900,
  originPincode: "390010",
  codEnabled: true,
};

export const DEFAULT_TAX: TaxSettings = {
  gstPercent: 18,
  pricesIncludeTax: true,
};

/* Empty rather than invented. The support page hides a channel it has no
   number for instead of printing a placeholder a customer might dial. */
export const DEFAULT_SUPPORT: SupportSettings = {
  email: "",
  phone: "",
  hours: "",
  whatsapp: "",
};

type Row = Record<string, unknown>;

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

export async function getAllSettings(): Promise<{
  shipping: ShippingSettings;
  tax: TaxSettings;
  support: SupportSettings;
}> {
  const rows = await db
    .select()
    .from(settings)
    .where(inArray(settings.key, ["shipping", "tax", "support"]));

  const byKey = new Map(rows.map((row) => [row.key, (row.value ?? {}) as Row]));
  const shipping = byKey.get("shipping") ?? {};
  const tax = byKey.get("tax") ?? {};
  const support = byKey.get("support") ?? {};

  return {
    shipping: {
      flatRateP: num(shipping.flatRateP, DEFAULT_SHIPPING.flatRateP),
      freeAboveP: num(shipping.freeAboveP, DEFAULT_SHIPPING.freeAboveP),
      originPincode: str(shipping.originPincode, DEFAULT_SHIPPING.originPincode),
      codEnabled: shipping.codEnabled !== false,
    },
    tax: {
      gstPercent: num(tax.gstPercent, DEFAULT_TAX.gstPercent),
      pricesIncludeTax: tax.pricesIncludeTax !== false,
    },
    support: {
      email: str(support.email, DEFAULT_SUPPORT.email),
      phone: str(support.phone, DEFAULT_SUPPORT.phone),
      hours: str(support.hours, DEFAULT_SUPPORT.hours),
      whatsapp: str(support.whatsapp, DEFAULT_SUPPORT.whatsapp),
    },
  };
}

/** The slice the cart and order paths need. */
export async function getShopSettings(): Promise<ShopSettings> {
  const all = await getAllSettings();
  return { ...all.shipping, ...all.tax };
}

export async function getSupportSettings(): Promise<SupportSettings> {
  return (await getAllSettings()).support;
}

/** Upserts one settings key. The row is the whole value, not a merge. */
export async function writeSetting(key: string, value: Record<string, unknown>) {
  await db
    .insert(settings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() },
    });
}
