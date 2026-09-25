import Link from "next/link";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/auth/LogoutButton";
import { getCurrentUser } from "@/server/auth/session";

export const dynamic = "force-dynamic";

/**
 * The admin boundary.
 *
 * Checked on the SERVER for every request under /admin, so no admin markup is
 * ever sent to a customer. A signed-out visitor is sent to sign in; a signed-in
 * customer gets a 404, which does not confirm that an admin area exists here.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await getCurrentUser();

  if (!user) redirect("/login?next=/admin");
  if (user.role !== "ADMIN") redirect("/");

  return (
    <div className="min-h-dvh bg-sr-canvas">
      <header className="bg-night">
        <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center gap-3 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sr-600 text-xs font-bold tracking-tight text-white">
              SR
            </span>
            <span className="font-display text-base font-semibold text-white">
              Shiv Radium <span className="text-sr-300">Admin</span>
            </span>
          </Link>

          {/* Scrolls sideways on a phone rather than disappearing. It used to
              be hidden below 640px, which left the admin with no way to reach
              another section from a handset at all. */}
          <nav
            aria-label="Admin"
            className="gc-hide-scrollbar order-3 -mx-4 flex w-[calc(100%+2rem)] shrink-0 gap-4 overflow-x-auto px-4 text-sm sm:order-none sm:mx-0 sm:ml-4 sm:w-auto sm:overflow-visible sm:px-0"
          >
            <Link href="/admin" className="shrink-0 whitespace-nowrap text-sr-100 transition hover:text-white">
              Dashboard
            </Link>
            <Link href="/admin/orders" className="shrink-0 whitespace-nowrap text-sr-100 transition hover:text-white">
              Orders
            </Link>
            <Link href="/admin/payments" className="shrink-0 whitespace-nowrap text-sr-100 transition hover:text-white">
              Payments
            </Link>
            <Link href="/admin/products" className="shrink-0 whitespace-nowrap text-sr-100 transition hover:text-white">
              Products
            </Link>
            <Link href="/admin/categories" className="shrink-0 whitespace-nowrap text-sr-100 transition hover:text-white">
              Categories
            </Link>
            <Link href="/admin/reviews" className="shrink-0 whitespace-nowrap text-sr-100 transition hover:text-white">
              Reviews
            </Link>
            <Link href="/admin/coupons" className="shrink-0 whitespace-nowrap text-sr-100 transition hover:text-white">
              Coupons
            </Link>
            <Link href="/admin/banners" className="shrink-0 whitespace-nowrap text-sr-100 transition hover:text-white">
              Banners
            </Link>
            <Link href="/admin/storefront" className="shrink-0 whitespace-nowrap text-sr-100 transition hover:text-white">
              Storefront
            </Link>
            <Link href="/admin/users" className="shrink-0 whitespace-nowrap text-sr-100 transition hover:text-white">
              Customers
            </Link>
            <Link href="/admin/settings" className="shrink-0 whitespace-nowrap text-sr-100 transition hover:text-white">
              Settings
            </Link>
            <Link href="/" className="shrink-0 whitespace-nowrap text-sr-100 transition hover:text-white">
              View store
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-sr-200">{user.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1280px] px-4 py-6">{children}</main>
    </div>
  );
}
