import type { Metadata } from "next";
import { desc } from "drizzle-orm";

import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db";
import { newsletterSubscribers } from "@/server/db/schema";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Subscribers", robots: { index: false, follow: false } };

export default async function AdminSubscribersPage() {
  await requireAdmin();

  const rows = await db
    .select()
    .from(newsletterSubscribers)
    .orderBy(desc(newsletterSubscribers.createdAt))
    .limit(5000);

  const emails = rows.map((r) => r.email).filter(Boolean) as string[];
  const phones = rows.map((r) => r.phone).filter(Boolean) as string[];

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-sr-ink">Subscribers</h1>
      <p className="mt-1 text-sm text-sr-muted">
        {rows.length} subscriber{rows.length === 1 ? "" : "s"} ({emails.length} email
        {emails.length === 1 ? "" : "s"}, {phones.length} mobile{phones.length === 1 ? "" : "s"})
        captured by the promo pop-up. Configure it under{" "}
        <span className="font-medium text-sr-body">Storefront → Promo pop-up</span>.
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-card border border-dashed border-sr-line-strong bg-sr-surface px-4 py-10 text-center text-sm text-sr-muted">
          No subscribers yet. They appear here as visitors subscribe.
        </p>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-sr-ink">All emails (select and copy)</label>
              <textarea
                readOnly
                rows={3}
                defaultValue={emails.join(", ")}
                className="mt-1 w-full resize-y rounded-lg border border-field bg-field-bg px-3 py-2 text-xs text-sr-body outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-sr-ink">All mobiles (select and copy)</label>
              <textarea
                readOnly
                rows={3}
                defaultValue={phones.join(", ")}
                className="mt-1 w-full resize-y rounded-lg border border-field bg-field-bg px-3 py-2 text-xs text-sr-body outline-none"
              />
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-card border border-sr-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-sr-canvas text-xs text-sr-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Email</th>
                  <th className="px-4 py-2 font-semibold">Mobile</th>
                  <th className="px-4 py-2 font-semibold">Source</th>
                  <th className="px-4 py-2 font-semibold">Subscribed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className={i % 2 === 0 ? "bg-sr-surface" : "bg-sr-canvas"}>
                    <td className="px-4 py-2 text-sr-ink">{r.email ?? "—"}</td>
                    <td className="px-4 py-2 text-sr-ink">{r.phone ?? "—"}</td>
                    <td className="px-4 py-2 text-sr-muted">{r.source}</td>
                    <td className="px-4 py-2 text-sr-muted">
                      {new Date(r.createdAt).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
