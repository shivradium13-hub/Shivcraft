import { eq } from "drizzle-orm";

import { normaliseStorefront, type StorefrontSettings } from "@/lib/storefront";
import { db } from "@/server/db";
import { settings } from "@/server/db/schema";

const KEY = "storefront";

/** The storefront layout config, always returned complete and valid. */
export async function getStorefrontSettings(): Promise<StorefrontSettings> {
  const rows = await db.select().from(settings).where(eq(settings.key, KEY)).limit(1);
  return normaliseStorefront(rows[0]?.value);
}

/** Persists the config. The value is normalised first, so a partial or stale
 *  shape can never be written back. */
export async function writeStorefrontSettings(value: unknown): Promise<StorefrontSettings> {
  const clean = normaliseStorefront(value);
  await db
    .insert(settings)
    .values({ key: KEY, value: clean, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value: clean, updatedAt: new Date() } });
  return clean;
}
