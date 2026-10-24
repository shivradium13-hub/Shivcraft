import { ok, route } from "@/server/api/http";
import { requireAdmin } from "@/server/auth/guards";
import { runDailyReport } from "@/server/reports/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/reports/daily-test — send the daily orders digest right now, to
 * the configured channels, so the owner can test it on demand (instead of waiting
 * for the evening cron). Returns the per-channel result, including any WhatsApp
 * error, so the admin UI can show exactly what happened.
 */
export const POST = route(async () => {
  await requireAdmin();
  return ok(await runDailyReport());
});
