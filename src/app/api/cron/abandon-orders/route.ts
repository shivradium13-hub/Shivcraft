import { cancelAbandonedOrders } from "@/server/orders/abandon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/abandon-orders — releases orders that were placed but never paid.
 *
 * Invoked by Vercel Cron (see vercel.json). Protected by CRON_SECRET, sent as a
 * Bearer token on the scheduled request. `cancelAbandonedOrders` only cancels
 * orders the gateway confirms are unpaid, so this is safe to run on a schedule.
 *
 * `?dry=1` reports what WOULD be cancelled without changing anything — handy for
 * a one-off check (still admin-only via the secret).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dry") === "1";

  try {
    const report = await cancelAbandonedOrders({ dryRun });
    console.info(
      `[cron] abandon-orders: scanned ${report.scanned}, ${dryRun ? "would cancel" : "cancelled"} ${report.cancelled.length}, skipped paid ${report.skippedPaid.length}, unknown ${report.skippedUnknown.length}`,
    );
    return Response.json({ ok: true, ...report });
  } catch (error) {
    console.error("[cron] abandon-orders failed:", error);
    return new Response("error", { status: 500 });
  }
}
