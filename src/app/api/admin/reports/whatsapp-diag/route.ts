import { ApiError, ok, route } from "@/server/api/http";
import { requireAdmin } from "@/server/auth/guards";
import { getWhatsappEnv } from "@/server/whatsapp/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/reports/whatsapp-diag — a read-only WhatsApp wiring check for
 * the daily report. It figures out which WhatsApp Business Account (WABA) the
 * SENDING phone number belongs to, and whether a given template exists on that
 * same WABA — which is exactly what a #132001 "template name does not exist"
 * send error turns on. Admin-only; returns ids (not secrets).
 *
 * Query params (all optional):
 *   name=…    template to look for (default daily_orders_report_pdf)
 *   waba=…    comma-separated WABA ids to check (added to the known default)
 *   portfolio=…  business portfolio id to enumerate WABAs from
 */

const REPORT_TEMPLATE = "daily_orders_report_pdf";
// The WABA the report template was created on (confirmed via template-info).
const KNOWN_WABA = "1554030820098355";

async function graph<T>(url: string, token: string): Promise<{ ok: true; json: T } | { ok: false; error: string }> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  const json = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const msg = (json as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}`;
    return { ok: false, error: msg };
  }
  return { ok: true, json: json as T };
}

export const GET = route(async (request: Request) => {
  await requireAdmin();
  const env = getWhatsappEnv();
  if (!env.token || !env.phoneNumberId) {
    throw new ApiError("BAD_REQUEST", "WhatsApp isn't configured (missing token or phone number id).");
  }
  const v = env.graphVersion;
  const g = `https://graph.facebook.com/${v}`;
  const sp = new URL(request.url).searchParams;
  const templateName = sp.get("name") || REPORT_TEMPLATE;

  // Candidate WABAs: the known template WABA, plus any passed in, plus any we can
  // enumerate from the portfolio id(s) we know about.
  const candidates = new Map<string, string>();
  candidates.set(KNOWN_WABA, "known-template-waba");
  for (const w of (sp.get("waba") || "").split(",").map((s) => s.trim()).filter(Boolean)) candidates.set(w, "param");

  const portfolios = [sp.get("portfolio"), env.businessAccountId, "1510786667565708"].filter(Boolean) as string[];
  const edgeErrors: Record<string, string> = {};
  for (const pid of portfolios) {
    for (const edge of ["owned_whatsapp_business_accounts", "client_whatsapp_business_accounts"]) {
      const r = await graph<{ data?: { id: string; name?: string }[] }>(
        `${g}/${pid}/${edge}?fields=id,name&limit=100`,
        env.token,
      );
      if (r.ok) for (const w of r.json.data ?? []) candidates.set(w.id, w.name ?? "");
      else edgeErrors[`${pid}/${edge}`] = r.error;
    }
  }

  // For each candidate WABA: list its phones + whether the template lives there.
  const wabas = [];
  for (const [id, name] of candidates) {
    const phones = await graph<{ data?: { id: string; display_phone_number?: string }[] }>(
      `${g}/${id}/phone_numbers?fields=id,display_phone_number&limit=100`,
      env.token,
    );
    const tpl = await graph<{ data?: { name: string; status: string }[] }>(
      `${g}/${id}/message_templates?fields=name,status&name=${encodeURIComponent(templateName)}`,
      env.token,
    );
    const phoneList = phones.ok ? (phones.json.data ?? []) : [];
    wabas.push({
      wabaId: id,
      wabaName: name,
      phonesError: phones.ok ? null : phones.error,
      phones: phoneList.map((p) => ({ id: p.id, number: p.display_phone_number ?? "" })),
      containsSendingPhone: phoneList.some((p) => p.id === env.phoneNumberId),
      hasTemplate: tpl.ok ? (tpl.json.data ?? []).some((t) => t.name === templateName) : false,
      templateStatus: tpl.ok ? ((tpl.json.data ?? []).find((t) => t.name === templateName)?.status ?? null) : `error: ${tpl.error}`,
    });
  }

  const phoneWaba = wabas.find((w) => w.containsSendingPhone);
  return ok({
    templateName,
    envBusinessAccountId: env.businessAccountId,
    sendingPhoneId: env.phoneNumberId,
    phoneFoundOnWaba: phoneWaba?.wabaId ?? null,
    edgeErrors,
    wabas,
    verdict: !phoneWaba
      ? "UNKNOWN: could not place the sending phone on any checked WABA."
      : phoneWaba.hasTemplate
        ? "OK: the sending phone's WABA has the template (so #132001 should not happen)."
        : `MISMATCH: phone is on WABA ${phoneWaba.wabaId}, but the template is NOT there (that is the #132001 cause).`,
  });
});
