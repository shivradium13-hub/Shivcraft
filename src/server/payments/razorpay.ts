import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Razorpay, called over its REST API rather than through the SDK.
 *
 * Two calls are needed (create an order, verify a signature) and both are
 * plain HTTPS plus an HMAC, so a dependency would add supply-chain surface for
 * no benefit and nothing here needs the SDK's extras.
 *
 * NOTE: this is written against Razorpay's documented Orders API. No live call
 * has been made from this machine because no keys are configured, so the first
 * real transaction should be watched in Razorpay's test mode.
 */

const API = "https://api.razorpay.com/v1";

export type RazorpayConfig = { keyId: string; keySecret: string };

/** Null when the keys are absent — the UI uses this to disable online payment
 *  rather than offering a button that cannot work. */
export function getRazorpayConfig(): RazorpayConfig | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

export function isRazorpayConfigured(): boolean {
  return getRazorpayConfig() !== null;
}

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  status: string;
};

/**
 * Creates the gateway-side order. `amountP` is paise, which is also Razorpay's
 * unit, so no conversion happens here — the value is passed through exactly.
 */
export async function createRazorpayOrder(
  amountP: number,
  receipt: string,
  notes: Record<string, string> = {},
): Promise<RazorpayOrder> {
  const config = getRazorpayConfig();
  if (!config) throw new Error("Razorpay is not configured");

  const auth = Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64");

  const response = await fetch(`${API}/orders`, {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      amount: amountP,
      currency: "INR",
      receipt: receipt.slice(0, 40),
      notes,
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    // Razorpay's own wording goes to the log, never to the customer.
    console.error("[razorpay] order create failed:", response.status, payload);
    throw new Error("Razorpay rejected the order");
  }

  return payload as RazorpayOrder;
}

/**
 * Confirms the callback really came from Razorpay.
 *
 * The signature is HMAC-SHA256 of "<order_id>|<payment_id>" keyed with the
 * secret. Compared in constant time, because a timing-variable compare leaks
 * how much of a forged signature was correct. Without this check anyone could
 * POST a fake success and mark an unpaid order paid.
 */
export function verifyRazorpaySignature(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
}): boolean {
  const config = getRazorpayConfig();
  if (!config) return false;

  const expected = createHmac("sha256", config.keySecret)
    .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
    .digest("hex");

  const given = input.signature.trim().toLowerCase();
  if (given.length !== expected.length) return false;

  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(given, "hex"));
  } catch {
    return false;
  }
}
