import { applyStatusUpdate, verifyWebhookSignature, webhookVerifyToken } from "@/server/whatsapp/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/whatsapp/webhook — Meta's subscription verification. Echoes back
 * hub.challenge only when hub.verify_token matches the configured secret.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = webhookVerifyToken();

  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

/**
 * POST /api/whatsapp/webhook — delivery-status callbacks. The raw body is
 * authenticated with the app secret (x-hub-signature-256) before anything is
 * trusted; an unsigned or wrongly-signed request is rejected. Processing is
 * idempotent (status keyed by the provider message id), and we always answer
 * 200 on authenticated requests so Meta does not retry forever.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyWebhookSignature(raw, signature)) {
    return new Response("invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("ok", { status: 200 });
  }

  try {
    const entries = (payload as { entry?: unknown[] })?.entry ?? [];
    for (const entry of entries) {
      const changes = (entry as { changes?: unknown[] })?.changes ?? [];
      for (const change of changes) {
        const statuses = (change as { value?: { statuses?: unknown[] } })?.value?.statuses ?? [];
        for (const st of statuses) {
          const s = st as { id?: string; status?: string };
          if (s?.id && s?.status) await applyStatusUpdate(s.id, s.status);
        }
      }
    }
  } catch (error) {
    console.error("[whatsapp] webhook processing error:", error);
  }

  return new Response("ok", { status: 200 });
}
