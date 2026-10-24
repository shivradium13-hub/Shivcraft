import { formatPaise } from "@/lib/money";
import { sendAdminEmail } from "@/server/email/service";
import { getEmailSettings } from "@/server/email/settings";
import { buildDailyOrdersReport } from "@/server/reports/dailyOrders";
import { buildDailyOrdersPdf } from "@/server/reports/dailyOrdersPdf";
import { getReportSettings } from "@/server/reports/settings";
import { getWhatsappSettings } from "@/server/whatsapp/settings";
import { sendReportTemplate } from "@/server/whatsapp/service";

export type DailyReportResult = {
  count: number;
  whatsapp: { ok: boolean; mock: boolean; error: string | null } | null;
  email: { ok: boolean; mock: boolean } | null;
};

/**
 * Build and send the daily orders digest over the configured channels. Shared by
 * the scheduled cron and the admin "send now" test. Each channel is best-effort;
 * a WhatsApp failure (PDF build, media upload, template/document-header mismatch)
 * is returned as `whatsapp.error` rather than thrown, so the caller can show it.
 */
export async function runDailyReport(): Promise<DailyReportResult> {
  const [report, reports, waSettings, emailSettings] = await Promise.all([
    buildDailyOrdersReport(),
    getReportSettings(),
    getWhatsappSettings(),
    getEmailSettings(),
  ]);

  let whatsapp: DailyReportResult["whatsapp"] = null;
  if (reports.whatsappTemplate && reports.whatsappTo) {
    const params = [
      report.dateLabel,
      String(report.count),
      formatPaise(report.paidRevenueP),
      String(report.pendingPaymentCount),
      String(report.cancelledCount),
    ];
    try {
      // The PDF is attached ONLY when the template has a Document header
      // (reports.whatsappPdf). With a plain text-header template, attaching a
      // document would make WhatsApp reject it (#132012).
      const pdf = reports.whatsappPdf ? await buildDailyOrdersPdf() : null;
      const r = await sendReportTemplate({
        phone: reports.whatsappTo,
        template: reports.whatsappTemplate,
        language: reports.language,
        bodyParams: params,
        enabled: waSettings.enabled,
        document: pdf ? { bytes: pdf.bytes, filename: pdf.filename } : undefined,
      });
      whatsapp = { ok: r.ok, mock: r.mock, error: r.error ?? null };
    } catch (error) {
      console.error("[report] whatsapp failed:", error);
      whatsapp = { ok: false, mock: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  let email: DailyReportResult["email"] = null;
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

  return { count: report.count, whatsapp, email };
}
