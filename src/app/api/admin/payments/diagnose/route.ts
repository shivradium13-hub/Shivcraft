import { ok, route } from "@/server/api/http";
import { requireAdmin } from "@/server/auth/guards";
import { getRazorpayConfig, razorpayStatus } from "@/server/payments/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RazorpayResponse = {
  count?: number;
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
 * Admin-only connectivity check for Razorpay. A READ-ONLY call (lists one order)
 * with the same credentials checkout uses, returning Razorpay's exact response —
 * HTTP status plus any error code/description — so a broken setup can be
 * diagnosed without reading server logs and without creating any order.
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
    const res = await fetch("https://api.razorpay.com/v1/orders?count=1", {
      method: "GET",
      headers: { authorization: `Basic ${auth}` },
    });
    httpStatus = res.status;
    okFlag = res.ok;
    const payload = (await res.json().catch(() => null)) as RazorpayResponse | null;
    razorpay = okFlag
      ? { reachable: true, recentOrders: payload?.count ?? 0 }
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
