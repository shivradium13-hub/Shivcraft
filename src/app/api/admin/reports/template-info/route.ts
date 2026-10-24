import { ApiError, ok, route } from "@/server/api/http";
import { requireAdmin } from "@/server/auth/guards";
import { getWhatsappEnv } from "@/server/whatsapp/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/reports/template-info?name=daily_orders_report — reads a message
 * template's structure (header format, body text, example) straight from Meta, so
 * we can match the send parameters exactly. Admin-only; returns no secrets.
 */
export const GET = route(async (request: Request) => {
  await requireAdmin();
  const env = getWhatsappEnv();
  if (!env.token || !env.businessAccountId) {
    throw new ApiError("BAD_REQUEST", "WhatsApp isn't configured (missing access token or business account id).");
  }

  const name = new URL(request.url).searchParams.get("name") || "daily_orders_report";
  const url = `https://graph.facebook.com/${env.graphVersion}/${env.businessAccountId}/message_templates?name=${encodeURIComponent(name)}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${env.token}` }, cache: "no-store" });
  const json = (await res.json().catch(() => null)) as {
    data?: { name?: string; status?: string; language?: string; components?: unknown }[];
    error?: { message?: string };
  } | null;

  if (!res.ok) {
    throw new ApiError("SERVER_ERROR", `Meta rejected the request: ${json?.error?.message ?? res.status}`);
  }

  const t = json?.data?.[0];
  if (!t) return ok({ found: false, name });
  return ok({ found: true, name: t.name, status: t.status, language: t.language, components: t.components });
});
