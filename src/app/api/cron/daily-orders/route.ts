import { sendAdminEmail } from "@/server/email/service";
import { getEmailSettings } from "@/server/email/settings";
import { buildDailyOrdersReport } from "@/server/reports/dailyOrders";
import { getAllSettings } from "@/server/settings/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Where the digest goes when no support/business email is configured. */
const FALLBACK_RECIPIENT = "shivradium13@gmail.com";

/**
 * GET /api/cron/daily-orders — the evening digest of the day's orders, emailed to
 * the owner. Invoked by Vercel Cron (see vercel.json). Protected by CRON_SECRET:
 * Vercel sends it as a Bearer token on the scheduled request, so a public call
 * without it is rejected. Read-only except for sending one email; it never
 * returns order data to the caller.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const [report, emailSettings, settings] = await Promise.all([
      buildDailyOrdersReport(),
      getEmailSettings(),
      getAllSettings(),
    ]);

    const to = settings.support.email || settings.business.email || FALLBACK_RECIPIENT;
    const result = await sendAdminEmail({
      to,
      subject: report.subject,
      html: report.html,
      text: report.text,
      settings: emailSettings,
    });

    console.info(
      `[cron] daily-orders: ${report.count} order(s), email ${result.mock ? "mock" : result.ok ? "sent" : "failed"}`,
    );
    return Response.json({ ok: true, count: report.count, sent: result.ok && !result.mock, mock: result.mock });
  } catch (error) {
    console.error("[cron] daily-orders failed:", error);
    return new Response("error", { status: 500 });
  }
}
