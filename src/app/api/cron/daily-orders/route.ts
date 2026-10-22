import { formatPaise } from "@/lib/money";
import { sendAdminEmail } from "@/server/email/service";
import { getEmailSettings } from "@/server/email/settings";
import { buildDailyOrdersReport } from "@/server/reports/dailyOrders";
import { getReportSettings } from "@/server/reports/settings";
import { getWhatsappSettings } from "@/server/whatsapp/settings";
import { sendReportTemplate } from "@/server/whatsapp/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/daily-orders — the evening digest of the day's orders, sent to
 * the owner. Invoked by Vercel Cron (see vercel.json). Protected by CRON_SECRET:
 * Vercel sends it as a Bearer token on the scheduled request, so a public call
 * without it is rejected.
 *
 * Channels are configured in the "reports" settings and each is best-effort:
 *  - WhatsApp: a short summary via an approved template (needs template + number).
 *  - Email: the full per-order report (needs an email recipient).
 * A channel with nothing configured is skipped. Read-only except for sending;
 * no order data is returned to the caller.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const [report, reports, waSettings, emailSettings] = await Promise.all([
      buildDailyOrdersReport(),
      getReportSettings(),
      getWhatsappSettings(),
      getEmailSettings(),
    ]);

    let whatsapp: { ok: boolean; mock: boolean } | null = null;
    if (reports.whatsappTemplate && reports.whatsappTo) {
      // WhatsApp templates take fixed body variables — a short summary, not the
      // per-order table (that stays in email). Order: date, count, collected,
      // awaiting payment, cancelled.
      const params = [
        report.dateLabel,
        String(report.count),
        formatPaise(report.paidRevenueP),
        String(report.pendingPaymentCount),
        String(report.cancelledCount),
      ];
      const r = await sendReportTemplate({
        phone: reports.whatsappTo,
        template: reports.whatsappTemplate,
        language: reports.language,
        bodyParams: params,
        enabled: waSettings.enabled,
      });
      whatsapp = { ok: r.ok, mock: r.mock };
    }

    let email: { ok: boolean; mock: boolean } | null = null;
    if (reports.emailTo) {
      const r = await sendAdminEmail({
        to: reports.emailTo,
        subject: report.subject,
        html: report.html,
        text: report.text,
        settings: emailSettings,
      });
      email = { ok: r.ok, mock: r.mock };
    }

    console.info(
      `[cron] daily-orders: ${report.count} order(s); whatsapp=${whatsapp ? (whatsapp.mock ? "mock" : whatsapp.ok ? "sent" : "failed") : "off"}; email=${email ? (email.mock ? "mock" : email.ok ? "sent" : "failed") : "off"}`,
    );
    return Response.json({ ok: true, count: report.count, whatsapp, email });
  } catch (error) {
    console.error("[cron] daily-orders failed:", error);
    return new Response("error", { status: 500 });
  }
}
