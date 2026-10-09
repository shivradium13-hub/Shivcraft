import { sql } from "drizzle-orm";

import { ApiError } from "@/server/api/http";
import { db } from "@/server/db";

/**
 * Best-effort client IP from the proxy headers Vercel sets. `x-forwarded-for`
 * is a comma-separated list; the first entry is the original client.
 */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Fixed-window rate limit backed by Postgres. Counts hits against `key` within
 * `windowSeconds` and throws RATE_LIMITED once more than `limit` arrive. The
 * upsert increments the counter (or resets an expired window) in one atomic
 * statement, so concurrent requests cannot slip past the cap.
 *
 * Fails OPEN: if the limiter query itself errors, the request is allowed rather
 * than locking real customers out over an infrastructure blip.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  message = "Too many attempts. Please wait a minute and try again.",
): Promise<void> {
  let count: number;
  try {
    const result = await db.execute<{ count: number }>(sql`
      INSERT INTO rate_limits (key, count, expires_at)
      VALUES (${key}, 1, now() + make_interval(secs => ${windowSeconds}))
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN rate_limits.expires_at < now() THEN 1 ELSE rate_limits.count + 1 END,
        expires_at = CASE WHEN rate_limits.expires_at < now()
          THEN now() + make_interval(secs => ${windowSeconds})
          ELSE rate_limits.expires_at END
      RETURNING count
    `);
    count = Number(result.rows[0]?.count ?? 1);
  } catch (error) {
    console.error("[rateLimit] check failed, allowing request:", error);
    return;
  }

  if (count > limit) {
    throw new ApiError("RATE_LIMITED", message);
  }
}
