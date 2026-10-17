import { createHmac, timingSafeEqual } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import { normalisePhone10 } from "@/lib/whatsapp";
import { db } from "@/server/db";
import { whatsappMessages } from "@/server/db/schema";

/**
 * The WhatsApp Cloud API service.
 *
 * Secrets live ONLY in env vars (never the database, never the client, never a
 * log). The integration runs in one of two modes:
 *
 *   mock  — nothing is actually delivered; every "send" is recorded in the
 *           whatsapp_messages log with status "mock". This is the default while
 *           the business is unverified / the sender restricted, so the whole
 *           flow is testable without a live message.
 *   live  — real Meta Cloud API calls. Entered ONLY when the admin has enabled
 *           the integration AND the credentials are present AND the explicit
 *           WHATSAPP_LIVE=true feature flag is set (so delivery can never turn
 *           itself on before the account is ready).
 */

export type WhatsappEnv = {
  token: string | null;
  phoneNumberId: string | null;
  businessAccountId: string | null;
  graphVersion: string;
  appSecret: string | null;
  webhookVerifyToken: string | null;
};

export function getWhatsappEnv(): WhatsappEnv {
  const e = process.env;
  return {
    // Prefer the spec's names; fall back to the older ones already in use.
    token: e.WHATSAPP_ACCESS_TOKEN || e.WHATSAPP_TOKEN || null,
    phoneNumberId: e.WHATSAPP_PHONE_NUMBER_ID || e.WHATSAPP_PHONE_ID || null,
    businessAccountId: e.WHATSAPP_BUSINESS_ACCOUNT_ID || null,
    graphVersion: e.WHATSAPP_GRAPH_VERSION || "v21.0",
    appSecret: e.WHATSAPP_APP_SECRET || null,
    webhookVerifyToken: e.WHATSAPP_WEBHOOK_VERIFY_TOKEN || null,
  };
}

/** Whether the server has the credentials needed to actually send. */
export function credentialsPresent(env = getWhatsappEnv()): boolean {
  return Boolean(env.token && env.phoneNumberId);
}

/** Live only when enabled by the admin, credentialed, and explicitly flagged. */
export function isLiveMode(enabled: boolean, env = getWhatsappEnv()): boolean {
  return enabled && credentialsPresent(env) && process.env.WHATSAPP_LIVE === "true";
}

/** A non-secret snapshot for the admin connection panel. */
export function whatsappStatus(enabled: boolean) {
  const env = getWhatsappEnv();
  const configured = credentialsPresent(env);
  const live = isLiveMode(enabled, env);
  const pid = env.phoneNumberId || "";
  return {
    enabled,
    configured,
    live,
    mode: live ? ("live" as const) : ("mock" as const),
    phoneNumberIdMasked: pid ? `•••••${pid.slice(-4)}` : null,
    businessAccountId: env.businessAccountId,
    graphVersion: env.graphVersion,
    hasAppSecret: Boolean(env.appSecret),
    webhookConfigured: Boolean(env.webhookVerifyToken),
    liveFlag: process.env.WHATSAPP_LIVE === "true",
  };
}

type LogInput = {
  kind: "otp" | "order";
  category: "AUTHENTICATION" | "UTILITY";
  toPhone: string;
  template?: string | null;
  userId?: string | null;
  orderId?: string | null;
  orderNumber?: string | null;
  status: string;
  providerMessageId?: string | null;
  error?: string | null;
  mock: boolean;
};

async function logMessage(input: LogInput): Promise<string | null> {
  try {
    const [row] = await db
      .insert(whatsappMessages)
      .values({
        kind: input.kind,
        category: input.category,
        toPhone: normalisePhone10(input.toPhone),
        template: input.template ?? null,
        userId: input.userId ?? null,
        orderId: input.orderId ?? null,
        orderNumber: input.orderNumber ?? null,
        status: input.status,
        providerMessageId: input.providerMessageId ?? null,
        error: input.error ?? null,
        mock: input.mock,
      })
      .returning({ id: whatsappMessages.id });
    return row?.id ?? null;
  } catch (error) {
    console.error("[whatsapp] message log failed:", error);
    return null;
  }
}

function toE164(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.length === 10 ? `91${d}` : d;
}

/** Low-level Meta Cloud API template send. Returns the provider message id. */
async function postTemplate(
  env: WhatsappEnv,
  toPhone: string,
  template: string,
  language: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  components: any[],
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/${env.graphVersion}/${env.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${env.token}`, "content-type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: toE164(toPhone),
          type: "template",
          template: { name: template, language: { code: language }, components },
        }),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string };
    };
    if (!res.ok) {
      // Provider wording stays in the server log, never reaches the customer.
      const msg = json?.error?.message || `HTTP ${res.status}`;
      console.error("[whatsapp] send failed:", res.status, msg);
      return { ok: false, error: msg.slice(0, 400) };
    }
    return { ok: true, messageId: json?.messages?.[0]?.id };
  } catch (error) {
    console.error("[whatsapp] send error:", error);
    return { ok: false, error: "network error" };
  }
}

export type SendResult = { ok: boolean; mock: boolean; logId: string | null };

/**
 * Send a login OTP via the approved Authentication template (body param = code,
 * and the same code for the one-tap "Copy code" button). Mock mode records the
 * attempt without delivering anything.
 */
export async function sendOtpMessage(args: {
  phone: string;
  code: string;
  template: string;
  language: string;
  enabled: boolean;
  userId?: string | null;
}): Promise<SendResult> {
  const env = getWhatsappEnv();
  const live = isLiveMode(args.enabled, env);
  const base = {
    kind: "otp" as const,
    category: "AUTHENTICATION" as const,
    toPhone: args.phone,
    template: args.template || null,
    userId: args.userId ?? null,
  };

  if (!live) {
    const logId = await logMessage({ ...base, status: "mock", mock: true });
    return { ok: true, mock: true, logId };
  }

  const result = await postTemplate(env, args.phone, args.template, args.language, [
    { type: "body", parameters: [{ type: "text", text: args.code }] },
    { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: args.code }] },
  ]);
  const logId = await logMessage({
    ...base,
    status: result.ok ? "sent" : "failed",
    providerMessageId: result.messageId ?? null,
    error: result.error ?? null,
    mock: false,
  });
  return { ok: result.ok, mock: false, logId };
}

/** Send a UTILITY order-update template with ordered body params. */
export async function sendOrderTemplate(args: {
  phone: string;
  template: string;
  language: string;
  bodyParams: string[];
  enabled: boolean;
  userId?: string | null;
  orderId?: string | null;
  orderNumber?: string | null;
}): Promise<SendResult> {
  const env = getWhatsappEnv();
  const live = isLiveMode(args.enabled, env);
  const base = {
    kind: "order" as const,
    category: "UTILITY" as const,
    toPhone: args.phone,
    template: args.template || null,
    userId: args.userId ?? null,
    orderId: args.orderId ?? null,
    orderNumber: args.orderNumber ?? null,
  };

  if (!args.template) return { ok: false, mock: !live, logId: null };

  if (!live) {
    const logId = await logMessage({ ...base, status: "mock", mock: true });
    return { ok: true, mock: true, logId };
  }

  const components = args.bodyParams.length
    ? [{ type: "body", parameters: args.bodyParams.map((text) => ({ type: "text", text })) }]
    : [];
  const result = await postTemplate(env, args.phone, args.template, args.language, components);
  const logId = await logMessage({
    ...base,
    status: result.ok ? "sent" : "failed",
    providerMessageId: result.messageId ?? null,
    error: result.error ?? null,
    mock: false,
  });
  return { ok: result.ok, mock: false, logId };
}

/**
 * Whether an order-update message for this order + template has already been
 * recorded (in any non-failed state), so a repeated status event or webhook
 * retry does not send a duplicate.
 */
export async function orderMessageAlreadySent(orderId: string, template: string): Promise<boolean> {
  const rows = await db
    .select({ id: whatsappMessages.id })
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.orderId, orderId),
        eq(whatsappMessages.template, template),
        inArray(whatsappMessages.status, ["queued", "mock", "sent", "delivered", "read"]),
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
}

/**
 * Apply a delivery-status update from the webhook to the matching log row
 * (keyed by the provider's message id). Only advances to a more final state.
 */
export async function applyStatusUpdate(providerMessageId: string, status: string): Promise<void> {
  const allowed = ["sent", "delivered", "read", "failed"];
  if (!allowed.includes(status)) return;
  try {
    await db
      .update(whatsappMessages)
      .set({ status, updatedAt: new Date() })
      .where(eq(whatsappMessages.providerMessageId, providerMessageId));
  } catch (error) {
    console.error("[whatsapp] status update failed:", error);
  }
}

/* --------------------------------------------------------------- webhook */

/** The token Meta echoes back on webhook subscription (GET challenge). */
export function webhookVerifyToken(): string | null {
  return getWhatsappEnv().webhookVerifyToken;
}

/**
 * Verify the `x-hub-signature-256` header against the raw body using the app
 * secret (HMAC-SHA256). Returns false when no secret is configured, so an
 * unauthenticated webhook is never trusted.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = getWhatsappEnv().appSecret;
  if (!secret || !signatureHeader) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}
