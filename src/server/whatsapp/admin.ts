import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

import { maskPhone } from "@/lib/whatsapp";
import { db } from "@/server/db";
import { whatsappMessages } from "@/server/db/schema";
import { getWhatsappSettings } from "@/server/whatsapp/settings";

export type WaLogRow = {
  id: string;
  kind: string;
  category: string | null;
  toPhoneMasked: string;
  orderNumber: string | null;
  template: string | null;
  status: string;
  mock: boolean;
  error: string | null;
  createdAt: Date;
};

/** The most recent messages, phone numbers masked, for the admin log. */
export async function recentMessages(limit = 50): Promise<WaLogRow[]> {
  const rows = await db
    .select()
    .from(whatsappMessages)
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(Math.min(200, Math.max(1, limit)));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    category: r.category,
    toPhoneMasked: maskPhone(r.toPhone),
    orderNumber: r.orderNumber,
    template: r.template,
    status: r.status,
    mock: r.mock,
    error: r.error,
    createdAt: r.createdAt,
  }));
}

/** This-month message counts + estimated cost (reporting only). */
export async function costSummary() {
  const since = new Date();
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const [billable, mocked] = await Promise.all([
    db
      .select({ category: whatsappMessages.category, n: sql<number>`count(*)::int` })
      .from(whatsappMessages)
      .where(
        and(
          gte(whatsappMessages.createdAt, since),
          eq(whatsappMessages.mock, false),
          inArray(whatsappMessages.status, ["sent", "delivered", "read"]),
        ),
      )
      .groupBy(whatsappMessages.category),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(whatsappMessages)
      .where(and(gte(whatsappMessages.createdAt, since), eq(whatsappMessages.mock, true))),
  ]);

  const settings = await getWhatsappSettings();
  const authCount = billable.find((b) => b.category === "AUTHENTICATION")?.n ?? 0;
  const utilityCount = billable.find((b) => b.category === "UTILITY")?.n ?? 0;
  const estimatedPaise = authCount * settings.rateAuthPaise + utilityCount * settings.rateUtilityPaise;

  return {
    monthLabel: since.toLocaleString("en-IN", { month: "long", year: "numeric" }),
    authCount,
    utilityCount,
    mockCount: mocked[0]?.n ?? 0,
    estimatedPaise,
    rateAuthPaise: settings.rateAuthPaise,
    rateUtilityPaise: settings.rateUtilityPaise,
  };
}

/** Re-send a previously failed message id is out of scope for mock mode; the
 *  admin re-triggers from the order screen. Exposed as a stub for the UI. */
export async function failedCount(): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(whatsappMessages)
    .where(eq(whatsappMessages.status, "failed"));
  return rows[0]?.n ?? 0;
}
