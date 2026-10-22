/**
 * Tests for auto-refund of a cancelled, online-paid order.
 * Run with:  pnpm test:refund
 *
 * Exercises refundForCancelledOrder against the real database with a throwaway
 * order + payment (cleaned up at the end). The Razorpay API is stubbed via
 * global.fetch — the DB uses the WebSocket driver, so the stub never touches it.
 * No real money moves. Exits non-zero on failure.
 */
import { and, eq, inArray } from "drizzle-orm";

// Dummy Razorpay creds BEFORE imports read them (so isRazorpayConfigured = true).
process.env.RAZORPAY_KEY_ID = "rzp_test_DUMMY";
process.env.RAZORPAY_KEY_SECRET = "secret_DUMMY";

import { hashPassword } from "@/server/auth/password";
import { db } from "@/server/db";
import { notifications, orderEvents, orders, payments, users } from "@/server/db/schema";
import { refundForCancelledOrder } from "@/server/orders/refund";
import { refundPayment } from "@/server/payments/razorpay";

const ORDER_NUMBER = "TEST-REFUND-0001";
const PHONE = "9000004444";

let failures = 0;
function check(name: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

const realFetch = globalThis.fetch;
let lastUrl = "";
let lastBody: Record<string, unknown> = {};
let calls = 0;
type Stub = { ok: boolean; status?: number; json: () => Promise<unknown> };
function stub(resp: Stub) {
  calls = 0;
  globalThis.fetch = (async (url: string, init?: { body?: string }) => {
    calls++;
    lastUrl = String(url);
    lastBody = init?.body ? JSON.parse(init.body) : {};
    return resp as unknown as Response;
  }) as typeof fetch;
}
const okRefund: Stub = { ok: true, json: async () => ({ id: "rfnd_TEST123", status: "processed", amount: 10000 }) };
const failRefund: Stub = { ok: false, status: 400, json: async () => ({ error: { description: "already refunded" } }) };

let userId = "";
async function cleanup() {
  const o = await db.select({ id: orders.id }).from(orders).where(eq(orders.orderNumber, ORDER_NUMBER)).limit(1);
  if (o[0]) {
    await db.delete(orderEvents).where(eq(orderEvents.orderId, o[0].id));
    await db.delete(payments).where(eq(payments.orderId, o[0].id));
    await db.delete(orders).where(eq(orders.id, o[0].id));
  }
  await db.delete(users).where(inArray(users.phone, [PHONE]));
}

async function seed() {
  const [u] = await db
    .insert(users)
    .values({ name: "Refund test", email: "refund-test@example.com", phone: PHONE, passwordHash: await hashPassword("x") })
    .returning({ id: users.id });
  userId = u.id;
  const [o] = await db
    .insert(orders)
    .values({
      orderNumber: ORDER_NUMBER,
      userId,
      status: "CANCELLED",
      shipName: "Refund test",
      shipPhone: PHONE,
      shipLine1: "1 Test St",
      shipCity: "Raigarh",
      shipState: "Chhattisgarh",
      shipPincode: "496661",
      subtotalP: 10000,
      totalP: 10000,
    })
    .returning({ id: orders.id });
  return o.id;
}

async function setPayment(orderId: string, fields: { status: "PAID" | "PENDING"; method: "UPI" | "COD"; gatewayPaymentId: string | null }) {
  await db.delete(payments).where(eq(payments.orderId, orderId));
  await db.insert(payments).values({ orderId, method: fields.method, status: fields.status, amountP: 10000, gatewayPaymentId: fields.gatewayPaymentId });
}
async function paymentStatus(orderId: string): Promise<string | null> {
  const rows = await db.select({ status: payments.status }).from(payments).where(eq(payments.orderId, orderId)).limit(1);
  return rows[0]?.status ?? null;
}
async function notifCount(): Promise<number> {
  const rows = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.type, "SYSTEM")));
  return rows.length;
}

async function main() {
  console.log("\nAuto-refund tests");
  await cleanup();
  const orderId = await seed();

  // --- razorpay.refundPayment unit ------------------------------------------
  stub(okRefund);
  const r = await refundPayment("pay_abc", 10000, { orderNumber: ORDER_NUMBER });
  check("refundPayment hits the refund endpoint", lastUrl.includes("/payments/pay_abc/refund"));
  check("refundPayment sends the amount in paise", lastBody.amount === 10000);
  check("refundPayment returns the refund id", r.id === "rfnd_TEST123");
  stub(failRefund);
  let threw = false;
  try {
    await refundPayment("pay_abc");
  } catch {
    threw = true;
  }
  check("refundPayment throws on a non-2xx", threw);

  // --- online paid → auto-refunded ------------------------------------------
  await setPayment(orderId, { status: "PAID", method: "UPI", gatewayPaymentId: "pay_online1" });
  stub(okRefund);
  const ok1 = await refundForCancelledOrder({ orderId, orderNumber: ORDER_NUMBER, userId, actorId: null });
  check("online paid → refunded:true", ok1.refunded === true && ok1.refundId === "rfnd_TEST123");
  check("…payment marked REFUNDED", (await paymentStatus(orderId)) === "REFUNDED");
  check("…customer gets a refund notification", (await notifCount()) === 1);
  check("…refund call used the gateway payment id", lastUrl.includes("/payments/pay_online1/refund"));

  // --- refund API fails → manual refund owed, payment untouched -------------
  await setPayment(orderId, { status: "PAID", method: "UPI", gatewayPaymentId: "pay_online2" });
  stub(failRefund);
  const failRes = await refundForCancelledOrder({ orderId, orderNumber: ORDER_NUMBER, userId, actorId: null });
  check("refund API failure → refunded:false, refundOwed:true", failRes.refunded === false && failRes.refundOwed === true);
  check("…payment stays PAID (no false 'refunded')", (await paymentStatus(orderId)) === "PAID");

  // --- COD → nothing to refund ----------------------------------------------
  await setPayment(orderId, { status: "PAID", method: "COD", gatewayPaymentId: null });
  stub(okRefund);
  const cod = await refundForCancelledOrder({ orderId, orderNumber: ORDER_NUMBER, userId, actorId: null });
  check("COD paid → no refund, no manual flag", cod.refunded === false && cod.refundOwed === false && calls === 0);

  // --- unpaid → nothing to refund -------------------------------------------
  await setPayment(orderId, { status: "PENDING", method: "UPI", gatewayPaymentId: "pay_x" });
  stub(okRefund);
  const unpaid = await refundForCancelledOrder({ orderId, orderNumber: ORDER_NUMBER, userId, actorId: null });
  check("unpaid order → no refund", unpaid.refunded === false && unpaid.refundOwed === false && calls === 0);

  // --- paid but no captured payment id → manual refund owed ------------------
  await setPayment(orderId, { status: "PAID", method: "UPI", gatewayPaymentId: null });
  stub(okRefund);
  const noId = await refundForCancelledOrder({ orderId, orderNumber: ORDER_NUMBER, userId, actorId: null });
  check("paid but no gateway id → manual refund owed, no API call", noId.refundOwed === true && noId.refunded === false && calls === 0);

  check("no key leaks into a result", !JSON.stringify([ok1, failRes]).includes("DUMMY"));

  globalThis.fetch = realFetch;
  await cleanup();

  console.log(failures === 0 ? "\n✓ All auto-refund tests passed\n" : `\n✗ ${failures} test(s) failed\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
