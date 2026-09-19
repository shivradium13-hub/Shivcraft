import type { Metadata } from "next";
import Link from "next/link";

import { UserControls } from "@/components/admin/UserControls";
import { formatPaise } from "@/lib/money";
import { listAdminUsers, userCounts, type UserFilter } from "@/server/admin/users";
import { requireAdmin } from "@/server/auth/guards";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Customers", robots: { index: false, follow: false } };

const PAGE_SIZE = 20;

const CHIPS: { value: UserFilter; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "admins", label: "Admins" },
  { value: "blocked", label: "Blocked" },
];

export default async function AdminUsersPage(props: PageProps<"/admin/users">) {
  const admin = await requireAdmin();
  const search = await props.searchParams;

  const raw = typeof search.filter === "string" ? search.filter : "all";
  const filter: UserFilter = raw === "admins" || raw === "blocked" ? raw : "all";
  const query = typeof search.q === "string" ? search.q.trim() : "";
  const page = Math.max(1, Number(typeof search.page === "string" ? search.page : 1) || 1);

  const [{ rows, total }, counts] = await Promise.all([
    listAdminUsers({ filter, query, page, limit: PAGE_SIZE }),
    userCounts(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const href = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const next = {
      filter: filter === "all" ? undefined : filter,
      q: query || undefined,
      ...patch,
    };
    for (const [key, value] of Object.entries(next)) if (value) params.set(key, value);
    const qs = params.toString();
    return qs ? `/admin/users?${qs}` : "/admin/users";
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-sr-ink">Customers</h1>
      <p className="mt-1 text-sm text-sr-muted">
        {counts.all} {counts.all === 1 ? "account" : "accounts"} · {counts.admins} with admin
        access{counts.blocked > 0 ? ` · ${counts.blocked} blocked` : ""}. Blocking signs someone out
        at once and stops them signing in or ordering.
      </p>

      <form action="/admin/users" className="mt-4 flex flex-wrap gap-2">
        {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
        <input
          name="q"
          defaultValue={query}
          placeholder="Name, email or phone"
          className="min-w-0 flex-1 rounded-lg border border-field bg-field-bg px-3 py-2 text-sm outline-none focus:border-sr-400"
        />
        <button
          type="submit"
          className="rounded-lg bg-sr-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Search
        </button>
        {query ? (
          <Link
            href={href({ q: undefined, page: undefined })}
            className="rounded-lg border border-sr-line-strong px-4 py-2 text-sm font-semibold text-sr-body"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {CHIPS.map((chip) => {
          const n =
            chip.value === "all"
              ? counts.all
              : chip.value === "admins"
                ? counts.admins
                : counts.blocked;
          const active = filter === chip.value;

          return (
            <Link
              key={chip.value}
              href={href({ filter: chip.value === "all" ? undefined : chip.value, page: undefined })}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "border-sr-600 bg-sr-600 text-white"
                  : "border-sr-line-strong text-sr-body hover:border-sr-400"
              }`}
            >
              {chip.label} ({n})
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-card border border-dashed border-field bg-field-bg px-4 py-10 text-center text-sm text-sr-muted">
          No accounts match this view.
        </p>
      ) : (
        <ul className="mt-5 grid gap-3 lg:grid-cols-2">
          {rows.map((user) => (
            <li
              key={user.id}
              className="rounded-card border border-sr-line bg-sr-surface p-4 shadow-card"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Link
                  href={`/admin/users/${user.id}`}
                  className="text-sm font-semibold text-sr-ink hover:text-sr-700"
                >
                  {user.name}
                </Link>
                <span className="flex gap-1.5">
                  {user.role === "ADMIN" ? (
                    <span className="rounded-full bg-sr-100 px-2 py-0.5 text-[11px] font-semibold text-sr-700">
                      Admin
                    </span>
                  ) : null}
                  {user.isBlocked ? (
                    <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger">
                      Blocked
                    </span>
                  ) : null}
                </span>
              </div>

              <p className="mt-0.5 text-xs text-sr-muted">
                {user.email}
                {user.phone ? ` · ${user.phone}` : ""}
              </p>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-sr-muted">
                <Row label="Orders">{user.orderCount}</Row>
                <Row label="Spent">{formatPaise(user.lifetimeSpendP)}</Row>
                <Row label="Reviews">{user.reviewCount}</Row>
                <Row label="Joined">{new Date(user.createdAt).toLocaleDateString("en-IN")}</Row>
              </dl>

              <UserControls
                user={{
                  id: user.id,
                  name: user.name,
                  email: user.email,
                  role: user.role,
                  isBlocked: user.isBlocked,
                  orderCount: user.orderCount,
                }}
                isSelf={user.id === admin.id}
              />
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <Link
              href={href({ page: String(page - 1) })}
              className="rounded-lg border border-sr-line-strong px-3 py-1.5 font-medium text-sr-body"
            >
              Previous
            </Link>
          ) : null}
          <span className="text-sr-muted">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={href({ page: String(page + 1) })}
              className="rounded-lg border border-sr-line-strong px-3 py-1.5 font-medium text-sr-body"
            >
              Next
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-1.5">
      <dt>{label}:</dt>
      <dd className="font-medium text-sr-ink">{children}</dd>
    </div>
  );
}
