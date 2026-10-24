import { runScheduledReport } from "@/server/reports/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/daily-orders — the digest of the day's orders, sent to the owner
 * over WhatsApp (and/or email) at the admin-chosen IST hour. Designed to be hit
 * as often as hourly (Vercel Cron in vercel.json as the daily guaranteed run,
 * plus an optional external hourly ping for a precise time) — `runScheduledReport`
 * sends at most once per IST day. Protected by CRON_SECRET: the caller sends it
 * as a Bearer token, so a public call without it is rejected.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await runScheduledReport();
    if (!result.sent) {
      console.info(`[cron] daily-orders: skipped (${result.reason})`);
      return Response.json({ ok: true, skipped: true, reason: result.reason });
    }
    console.info(
      `[cron] daily-orders: ${result.count} order(s); whatsapp=${result.whatsapp ? (result.whatsapp.mock ? "mock" : result.whatsapp.ok ? "sent" : `failed(${result.whatsapp.error ?? ""})`) : "off"}; email=${result.email ? (result.email.mock ? "mock" : result.email.ok ? "sent" : "failed") : "off"}`,
    );
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron] daily-orders failed:", error);
    return new Response("error", { status: 500 });
  }
}
