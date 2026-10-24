import { runDailyReport } from "@/server/reports/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/daily-orders — the evening digest of the day's orders, sent to
 * the owner over WhatsApp (and/or email). Invoked by Vercel Cron (see
 * vercel.json). Protected by CRON_SECRET: Vercel sends it as a Bearer token on
 * the scheduled request, so a public call without it is rejected.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await runDailyReport();
    console.info(
      `[cron] daily-orders: ${result.count} order(s); whatsapp=${result.whatsapp ? (result.whatsapp.mock ? "mock" : result.whatsapp.ok ? "sent" : `failed(${result.whatsapp.error ?? ""})`) : "off"}; email=${result.email ? (result.email.mock ? "mock" : result.email.ok ? "sent" : "failed") : "off"}`,
    );
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron] daily-orders failed:", error);
    return new Response("error", { status: 500 });
  }
}
