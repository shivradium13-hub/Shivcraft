import { timingSafeEqual } from "node:crypto";

import { ApiError, ok, route } from "@/server/api/http";
import { runDelhiveryNotificationWorker } from "@/server/delivery/notificationWorker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validBearer(request: Request, secret: string | undefined): boolean {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer /i, "") ?? "";
  if (!secret || !bearer) return false;
  const a = Buffer.from(secret, "utf8");
  const b = Buffer.from(bearer, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Schedule a POST to this endpoint from a trusted worker/cron integration.
 * No scheduler is enabled in this PR. Before activation, configure a strong
 * DELHIVERY_WORKER_SECRET and separately schedule this URL securely.
 */
export const POST = route(async (request: Request) => {
  if (!process.env.DELHIVERY_WORKER_SECRET) {
    throw new ApiError("SERVICE_UNAVAILABLE", "Worker is not configured.");
  }
  if (!validBearer(request, process.env.DELHIVERY_WORKER_SECRET)) {
    throw new ApiError("UNAUTHORIZED", "Unauthorized.");
  }
  return ok(await runDelhiveryNotificationWorker());
});
