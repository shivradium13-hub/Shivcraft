import { ok, route } from "@/server/api/http";
import { requireAdmin } from "@/server/auth/guards";
import { getRazorpayConfig, razorpayStatus } from "@/server/payments/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RazorpayOrderResponse = {
  id?: string;
  amount?: number;
  error?: {
    code?: string;
    description?: string;
    reason?: string;
    source?: string;
    step?: string;
    field?: string;
  };
};

/**
 * Admin-only connectivity check for Razorpay. Makes the SAME create-order call
 * checkout makes (amount ₹1) and returns Razorpay's exact response — HTTP status
 * plus its error code/description — so a broken setup can be diagnosed without
 * reading server logs.
 *
 * Never returns the secret. The key id is publishable (it reaches the browser at
 * checkout) and only its prefix is shown here; the lengths help spot a key that
 * was pasted with a stray space or the wrong value.
 */
export const GET = route(async () => {
  await requireAdmin();

  const status = razorpayStatus();
  const config = getRazorpayConfig();
  if (!config) {
    return ok({ configured: false, status });
  }

  let httpStatus = 0;
  let okFlag = false;
  let razorpay: unknown = null;
  let networkError: string | null = null;

  try {
    const auth = Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64");
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
      body: JSON.stringify({ amount: 100, currency: "INR", receipt: `diag-${Date.now()}` }),
    });
    httpStatus = res.status;
    okFlag = res.ok;
    const payload = (await res.json().catch(() => null)) as RazorpayOrderResponse | null;
    razorpay = okFlag
      ? { orderId: payload?.id, amount: payload?.amount }
      : {
          code: payload?.error?.code ?? null,
          description: payload?.error?.description ?? null,
          reason: payload?.error?.reason ?? null,
          source: payload?.error?.source ?? null,
          step: payload?.error?.step ?? null,
          field: payload?.error?.field ?? null,
        };
  } catch (error) {
    networkError = error instanceof Error ? error.message : String(error);
  }

  return ok({
    configured: true,
    mode: status.mode,
    keyIdPrefix: `${config.keyId.slice(0, 12)}…`,
    keyIdLength: config.keyId.length,
    keySecretLength: config.keySecret.length,
    httpStatus,
    ok: okFlag,
    razorpay,
    networkError,
  });
});
