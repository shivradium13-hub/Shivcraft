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
 */

const REPORT_TEMPLATE = "daily_orders_report_pdf";

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
  const templateName = new URL(request.url).searchParams.get("name") || REPORT_TEMPLATE;
  const g = `https://graph.facebook.com/${v}`;

  // 1) The sending phone, straight from its id — this includes its parent WABA.
  const phone = await graph<{
    id?: string;
    display_phone_number?: string;
    verified_name?: string;
    whatsapp_business_account?: { id?: string; name?: string };
  }>(`${g}/${env.phoneNumberId}?fields=id,display_phone_number,verified_name,whatsapp_business_account`, env.token);

  // 2) Gather candidate WABAs: the phone's own WABA, plus any under the portfolio.
  const candidates = new Map<string, string>(); // id -> name
  if (phone.ok && phone.json.whatsapp_business_account?.id) {
    candidates.set(phone.json.whatsapp_business_account.id, phone.json.whatsapp_business_account.name ?? "");
  }
  for (const edge of ["owned_whatsapp_business_accounts", "client_whatsapp_business_accounts"]) {
    if (!env.businessAccountId) break;
    const r = await graph<{ data?: { id: string; name?: string }[] }>(
      `${g}/${env.businessAccountId}/${edge}?fields=id,name&limit=50`,
      env.token,
    );
    if (r.ok) for (const w of r.json.data ?? []) candidates.set(w.id, w.name ?? "");
  }

  // 3) For each WABA: list its phones + whether the template lives there.
  const wabas = [];
  for (const [id, name] of candidates) {
    const phones = await graph<{ data?: { id: string; display_phone_number?: string }[] }>(
      `${g}/${id}/phone_numbers?fields=id,display_phone_number&limit=50`,
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
      phones: phoneList.map((p) => ({ id: p.id, number: p.display_phone_number ?? "" })),
      containsSendingPhone: phoneList.some((p) => p.id === env.phoneNumberId),
      hasTemplate: tpl.ok ? (tpl.json.data ?? []).some((t) => t.name === templateName) : false,
      templateStatus: tpl.ok ? ((tpl.json.data ?? []).find((t) => t.name === templateName)?.status ?? null) : `error: ${tpl.error}`,
    });
  }

  return ok({
    templateName,
    envBusinessAccountId: env.businessAccountId,
    sendingPhoneId: env.phoneNumberId,
    sendingPhoneNumber: phone.ok ? (phone.json.display_phone_number ?? null) : null,
    phoneWabaId: phone.ok ? (phone.json.whatsapp_business_account?.id ?? null) : null,
    phoneLookupError: phone.ok ? null : phone.error,
    wabas,
    verdict:
      wabas.find((w) => w.containsSendingPhone)?.hasTemplate === true
        ? "OK: the sending phone's WABA has the template."
        : "MISMATCH: the template is not on the sending phone's WABA (that is the #132001 cause).",
  });
});
