/**
 * Tests for the order_cancelled WhatsApp params. Run: pnpm test:cancelled
 * Seeds a throwaway order + items + payment, builds the 6 template variables,
 * and checks the refund-status branches. Cleaned up at the end.
 */
import { eq, inArray } from "drizzle-orm";

import { normaliseWhatsapp } from "@/lib/whatsapp";
import { hashPassword } from "@/server/auth/password";
import { db } from "@/server/db";
import { orderItems, orders, payments, users } from "@/server/db/schema";
import { buildCancelledParams } from "@/server/notify/orderNotify";

const NUM = "TEST-CANCEL-0001";
const PHONE = "9000002222";

let failures = 0;
function check(name: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

let orderId = "";
async function cleanup() {
  const o = await db.select({ id: orders.id }).from(orders).where(eq(orders.orderNumber, NUM)).limit(1);
  if (o[0]) {
    await db.delete(orderItems).where(eq(orderItems.orderId, o[0].id));
    await db.delete(payments).where(eq(payments.orderId, o[0].id));
    await db.delete(orders).where(eq(orders.id, o[0].id));
  }
  await db.delete(users).where(inArray(users.phone, [PHONE]));
}

async function setPayment(status: "REFUNDED" | "PAID" | "PENDING", method: "UPI" | "COD") {
  await db.delete(payments).where(eq(payments.orderId, orderId));
  await db.insert(payments).values({ orderId, method, status, amountP: 150000 });
}

async function main() {
  console.log("\norder_cancelled WhatsApp params tests");
  await cleanup();

  const [u] = await db
    .insert(users)
    .values({ name: "Asha Verma", email: "cancel-test@example.com", phone: PHONE, passwordHash: await hashPassword("x") })
    .returning({ id: users.id });
  const [o] = await db
    .insert(orders)
    .values({
      orderNumber: NUM,
      userId: u.id,
      status: "CANCELLED",
      cancelReason: "Changed my mind",
      shipName: "Asha Verma",
      shipPhone: PHONE,
      shipLine1: "1 St",
      shipCity: "Raigarh",
      shipState: "Chhattisgarh",
      shipPincode: "496661",
      subtotalP: 150000,
      totalP: 150000,
    })
    .returning({ id: orders.id });
  orderId = o.id;
  await db.insert(orderItems).values([
    { orderId, productName: "Photo Frame", quantity: 1, unitPriceP: 100000, lineTotalP: 100000 },
    { orderId, productName: "Name Plate", quantity: 2, unitPriceP: 25000, lineTotalP: 50000 },
  ]);

  // Refunded online payment.
  await setPayment("REFUNDED", "UPI");
  const p = await buildCancelledParams(orderId, NUM);
  check("returns 6 params", !!p && p.length === 6);
  if (p) {
    check("{{1}} = customer name", p[0] === "Asha Verma");
    check("{{2}} = order number", p[1] === NUM);
    check("{{3}} = products with qty", p[2] === "Photo Frame x1, Name Plate x2");
    check("{{4}} = amount without the rupee sign", p[3] === "1,500"); // 150000 paise = Rs 1,500
    check("{{5}} = cancellation reason", p[4] === "Changed my mind");
    check("{{6}} = refunded status", p[5].toLowerCase().includes("refunded"));
    check("no newlines/tabs in any param", p.every((x) => !/[\n\r\t]/.test(x)));
  }

  // Paid online but not yet refunded → "being processed".
  await setPayment("PAID", "UPI");
  const p2 = await buildCancelledParams(orderId, NUM);
  check("paid-not-refunded → refund being processed", !!p2 && p2[5].toLowerCase().includes("processed"));

  // COD → nothing to refund.
  await setPayment("PAID", "COD");
  const p3 = await buildCancelledParams(orderId, NUM);
  check("COD → no online payment to refund", !!p3 && p3[5].toLowerCase().includes("no online payment"));

  // Settings carry the new fields.
  const s = normaliseWhatsapp({ notifyCancelled: true, templateCancelled: "order_cancelled" });
  check("settings normalise notifyCancelled + templateCancelled", s.notifyCancelled === true && s.templateCancelled === "order_cancelled");

  await cleanup();
  console.log(failures === 0 ? "\n✓ All cancelled-notify tests passed\n" : `\n✗ ${failures} test(s) failed\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
