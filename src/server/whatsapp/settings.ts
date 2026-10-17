import { eq } from "drizzle-orm";

import { normaliseWhatsapp, type WhatsappSettings } from "@/lib/whatsapp";
import { db } from "@/server/db";
import { settings } from "@/server/db/schema";

const KEY = "whatsapp";

/** The WhatsApp integration config, always returned complete and valid. */
export async function getWhatsappSettings(): Promise<WhatsappSettings> {
  const rows = await db.select().from(settings).where(eq(settings.key, KEY)).limit(1);
  return normaliseWhatsapp(rows[0]?.value);
}

/** Persists the config. Normalised first, so a partial shape can't be stored. */
export async function writeWhatsappSettings(value: unknown): Promise<WhatsappSettings> {
  const clean = normaliseWhatsapp(value);
  await db
    .insert(settings)
    .values({ key: KEY, value: clean, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value: clean, updatedAt: new Date() } });
  return clean;
}
