import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";

import { AccountNav } from "@/components/shop/AccountNav";
import { getCurrentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { notifications } from "@/server/db/schema";

export const dynamic = "force-dynamic";

/** Every page under /account is signed-in only, checked here on the server so
 *  no account markup ever reaches a signed-out visitor. */
export default async function AccountLayout({ children }: LayoutProps<"/account">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account");

  const unreadRows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
      <AccountNav unread={unreadRows.length} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
