import type { Metadata } from "next";

import { NotificationsClient } from "@/components/shop/NotificationsClient";
import { getMyNotifications } from "@/server/account/queries";
import { requireUser } from "@/server/auth/guards";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notifications", robots: { index: false, follow: false } };

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await getMyNotifications(user.id);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Notifications</h1>
      <p className="mt-1 mb-5 text-sm text-muted">
        Order updates from the workshop, and offers when there are any.
      </p>
      {/* Dates are serialised here: a Date instance cannot cross into a Client
          Component, and formatting on the client keeps the visitor's locale. */}
      <NotificationsClient
        initial={items.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          href: n.href,
          readAt: n.readAt ? n.readAt.toISOString() : null,
          createdAt: n.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
