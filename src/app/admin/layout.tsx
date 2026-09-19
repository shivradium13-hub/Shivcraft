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
      <header className="border-b border-sr-line bg-sr-ink">
        <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center gap-3 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sr-500 text-xs font-bold text-white">
              SR
            </span>
            <span className="font-display text-base font-semibold text-white">
              Shiv Radium <span className="text-sr-300">Admin</span>
            </span>
          </Link>

          <nav aria-label="Admin" className="ml-4 hidden gap-4 text-sm sm:flex">
            <Link href="/admin" className="text-sr-100 hover:text-white">
              Dashboard
            </Link>
            <Link href="/admin/orders" className="text-sr-100 hover:text-white">
              Orders
            </Link>
            <Link href="/admin/products" className="text-sr-100 hover:text-white">
              Products
            </Link>
            <Link href="/admin/categories" className="text-sr-100 hover:text-white">
              Categories
            </Link>
            <Link href="/admin/reviews" className="text-sr-100 hover:text-white">
              Reviews
            </Link>
            <Link href="/" className="text-sr-100 hover:text-white">
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
