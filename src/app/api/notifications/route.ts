import { and, eq, isNull } from "drizzle-orm";

import { ok, route } from "@/server/api/http";
import { requireUser } from "@/server/auth/guards";
import { getMyNotifications } from "@/server/account/queries";
import { db } from "@/server/db";
import { notifications } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const user = await requireUser();
  return ok({ notifications: await getMyNotifications(user.id) });
});

/** POST /api/notifications — marks everything unread as read. */
export const POST = route(async () => {
  const user = await requireUser();

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));

  return ok({ notifications: await getMyNotifications(user.id) });
});
