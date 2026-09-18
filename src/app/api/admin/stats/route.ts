import { ok, route } from "@/server/api/http";
import { requireAdmin } from "@/server/auth/guards";
import { getAdminStats } from "@/server/admin/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/stats — ADMIN only. Same figures the dashboard renders. */
export const GET = route(async () => {
  await requireAdmin();
  return ok(await getAdminStats());
});
