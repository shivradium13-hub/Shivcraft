import { eq } from "drizzle-orm";

import { normaliseEmail, type EmailSettings } from "@/lib/email";
import { db } from "@/server/db";
import { settings } from "@/server/db/schema";

const KEY = "email";

/** The email (Brevo) integration config, always returned complete and valid. */
export async function getEmailSettings(): Promise<EmailSettings> {
  const rows = await db.select().from(settings).where(eq(settings.key, KEY)).limit(1);
  return normaliseEmail(rows[0]?.value);
}

/** Persists the config. Normalised first, so a partial shape can't be stored. */
export async function writeEmailSettings(value: unknown): Promise<EmailSettings> {
  const clean = normaliseEmail(value);
  await db
    .insert(settings)
    .values({ key: KEY, value: clean, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value: clean, updatedAt: new Date() } });
  return clean;
}
