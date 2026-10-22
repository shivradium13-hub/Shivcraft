/**
 * Tests for the daily orders digest. Run with:  pnpm test:daily-report
 *
 * istDayRange is pure; buildDailyOrdersReport runs against the DB with throwaway
 * orders (cleaned up). Email send is mock (EMAIL_LIVE unset) — no real email.
 */
import { eq, inArray } from "drizzle-orm";

delete process.env.EMAIL_LIVE; // keep email in mock mode

import { DEFAULT_EMAIL } from "@/lib/email";
import { hashPassword } from "@/server/auth/password";
import { db } from "@/server/db";
import { orders, payments, users } from "@/server/db/schema";
import { sendAdminEmail } from "@/server/email/service";
import { buildDailyOrdersReport, istDayRange } from "@/server/reports/dailyOrders";
import { normaliseReports } from "@/server/reports/settings";
import { sendReportTemplate } from "@/server/whatsapp/service";

const PHONE = "9000003333";
const NUMS = ["TEST-DR-A", "TEST-DR-B", "TEST-DR-C", "TEST-DR-YDAY"];
// A fixed "now": 2026-06-15 15:30 IST — avoids any real midnight-boundary flake.
const NOW = new Date("2026-06-15T10:00:00Z");

let failures = 0;
function check(name: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

let userId = "";
async function cleanup() {
  const os = await db.select({ id: orders.id }).from(orders).where(inArray(orders.orderNumber, NUMS));
  for (const o of os) await db.delete(payments).where(eq(payments.orderId, o.id));
  await db.delete(orders).where(inArray(orders.orderNumber, NUMS));
  await db.delete(users).where(inArray(users.phone, [PHONE]));
}

async function seedOrder(num: string, placedAt: Date, status: string, pay: { status: string; method: string } | null, totalP: number) {
  const [o] = await db
    .insert(orders)
    .values({
      orderNumber: num,
      userId,
      status: status as "PLACED",
      shipName: "DR test",
      shipPhone: PHONE,
      shipLine1: "1 St",
      shipCity: "Raigarh",
      shipState: "Chhattisgarh",
      shipPincode: "496661",
      subtotalP: totalP,
      totalP,
      placedAt,
    })
    .returning({ id: orders.id });
  if (pay) await db.insert(payments).values({ orderId: o.id, method: pay.method as "UPI", status: pay.status as "PAID", amountP: totalP });
}

async function main() {
  console.log("\nDaily orders report tests");

  // --- istDayRange (pure) ---------------------------------------------------
  const r = istDayRange(NOW);
  check("IST day start is 14 Jun 18:30 UTC", r.start.toISOString() === "2026-06-14T18:30:00.000Z");
  check("IST day end is 15 Jun 18:30 UTC", r.end.toISOString() === "2026-06-15T18:30:00.000Z");
  check("IST day label is '15 June 2026'", r.label === "15 June 2026");
  // 19:00 UTC is already past IST midnight → belongs to the next IST day.
  check("late-UTC time rolls into next IST day", istDayRange(new Date("2026-06-15T19:00:00Z")).label === "16 June 2026");

  // --- buildDailyOrdersReport against the DB --------------------------------
  await cleanup();
  const [u] = await db
    .insert(users)
    .values({ name: "DR test", email: "dr-test@example.com", phone: PHONE, passwordHash: await hashPassword("x") })
    .returning({ id: users.id });
  userId = u.id;

  const inDay = new Date("2026-06-15T10:00:00Z"); // inside the IST day of NOW
  await seedOrder("TEST-DR-A", inDay, "PLACED", { status: "PAID", method: "UPI" }, 10000);
  await seedOrder("TEST-DR-B", inDay, "PLACED", { status: "PENDING", method: "UPI" }, 5000);
  await seedOrder("TEST-DR-C", inDay, "CANCELLED", { status: "REFUNDED", method: "UPI" }, 3000);
  await seedOrder("TEST-DR-YDAY", new Date("2026-06-14T10:00:00Z"), "PLACED", { status: "PAID", method: "UPI" }, 9999);

  const report = await buildDailyOrdersReport(NOW);
  check("counts only today's orders (3, excludes yesterday)", report.count === 3);
  check("paid count + revenue correct", report.paidCount === 1 && report.paidRevenueP === 10000);
  check("pending-payment count correct", report.pendingPaymentCount === 1);
  check("cancelled count correct", report.cancelledCount === 1);
  check("by-status has PLACED:2", report.byStatus.find((s) => s.status === "PLACED")?.count === 2);
  check("yesterday's order is excluded", !report.orders.some((o) => o.orderNumber === "TEST-DR-YDAY"));
  check("subject names the count + date", report.subject.includes("3 orders") && report.subject.includes("15 June 2026"));
  check("html lists an order", report.html.includes("TEST-DR-A"));

  // Empty-day report still builds.
  const empty = await buildDailyOrdersReport(new Date("2020-01-01T10:00:00Z"));
  check("empty day → count 0, valid subject", empty.count === 0 && empty.subject.includes("0 orders"));

  // --- admin email send is mock (EMAIL_LIVE unset) --------------------------
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = ((...a: Parameters<typeof fetch>) => {
    calls++;
    return realFetch(...a);
  }) as typeof fetch;
  const sent = await sendAdminEmail({ to: "owner@example.com", subject: report.subject, html: report.html, text: report.text, settings: { ...DEFAULT_EMAIL, senderEmail: "no-reply@shivradium.com" } });
  const wa = await sendReportTemplate({ phone: "9000000000", template: "daily_orders_report", language: "en", bodyParams: ["x"], enabled: true });
  globalThis.fetch = realFetch;
  check("admin email is mock without EMAIL_LIVE, no network", sent.mock === true && calls === 0);
  check("WhatsApp report is mock without WHATSAPP_LIVE, no network", wa.mock === true && calls === 0);

  // --- report settings normalise -------------------------------------------
  const rs = normaliseReports({ whatsappTemplate: "  daily_orders_report ", whatsappTo: "9876543210" });
  check("report settings normalise (template trimmed, email empty, lang default)", rs.whatsappTemplate === "daily_orders_report" && rs.emailTo === "" && rs.language === "en");

  await cleanup();
  console.log(failures === 0 ? "\n✓ All daily-report tests passed\n" : `\n✗ ${failures} test(s) failed\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
