import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { settings } from "@/server/db/schema";

/**
 * Where the daily orders digest is delivered. Stored as one JSON row in the
 * `settings` table (key "reports"). All optional: a channel with nothing
 * configured is simply skipped by the cron, so the digest never half-sends.
 */
export type ReportSettings = {
  /** Approved Meta WhatsApp template name for the daily summary (empty = off). */
  whatsappTemplate: string;
  /** Owner's WhatsApp number the summary goes to (empty = off). */
  whatsappTo: string;
  /** Email address the full report goes to (empty = off). */
  emailTo: string;
  /** Template language code, e.g. "en". */
  language: string;
  /** Attach the PDF to WhatsApp — ONLY when the template has a Document header. */
  whatsappPdf: boolean;
};

export const DEFAULT_REPORTS: ReportSettings = {
  whatsappTemplate: "",
  whatsappTo: "",
  emailTo: "",
  language: "en",
  whatsappPdf: false,
};

function str(v: unknown, fallback: string, max = 120): string {
  return typeof v === "string" ? v.trim().slice(0, max) : fallback;
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

export function normaliseReports(value: unknown): ReportSettings {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const d = DEFAULT_REPORTS;
  return {
    whatsappTemplate: str(v.whatsappTemplate, d.whatsappTemplate, 80),
    whatsappTo: str(v.whatsappTo, d.whatsappTo, 20),
    emailTo: str(v.emailTo, d.emailTo),
    language: str(v.language, d.language, 12) || d.language,
    whatsappPdf: bool(v.whatsappPdf, d.whatsappPdf),
  };
}

const KEY = "reports";

export async function getReportSettings(): Promise<ReportSettings> {
  const rows = await db.select().from(settings).where(eq(settings.key, KEY)).limit(1);
  return normaliseReports(rows[0]?.value);
}

export async function writeReportSettings(value: unknown): Promise<ReportSettings> {
  const clean = normaliseReports(value);
  await db
    .insert(settings)
    .values({ key: KEY, value: clean, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value: clean, updatedAt: new Date() } });
  return clean;
}
