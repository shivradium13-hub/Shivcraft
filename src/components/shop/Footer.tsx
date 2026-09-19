import Link from "next/link";

const columns = [
  {
    title: "Shop",
    links: [
      { label: "Name Plates", href: "/category/name-plates" },
      { label: "Photo Frames", href: "/category/photo-frames" },
      { label: "Photo Mugs", href: "/category/photo-mugs" },
      { label: "Crafts", href: "/category/crafts" },
      { label: "Gifts", href: "/category/gifts" },
    ],
  },
  {
    title: "Occasions",
    links: [
      { label: "Birthday Gifts", href: "/category/birthday-gifts" },
      { label: "Anniversary Gifts", href: "/category/anniversary-gifts" },
      { label: "Wedding Gifts", href: "/category/wedding-gifts" },
      { label: "Couple Gifts", href: "/category/couple-gifts" },
      { label: "Festival Gifts", href: "/category/festival-gifts" },
    ],
  },
  {
    title: "Your account",
    links: [
      { label: "My Orders", href: "/account/orders" },
      { label: "Track Order", href: "/account/orders" },
      { label: "Wishlist", href: "/account/wishlist" },
      { label: "Saved Addresses", href: "/account/addresses" },
      { label: "Help & Support", href: "/support" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-12 bg-night text-white">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold tracking-tight text-white">
                SR
              </span>
              <span className="font-display text-xl font-semibold text-white">
                Shiv <span className="text-brand-500">Radium</span>
              </span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-night-muted">
              Personalised gifts made to order in India. We send you an artwork proof before
              anything is cut, printed or engraved.
            </p>
          </div>

          {columns.map((column) => (
            <div key={column.title}>
              <h3 className="text-[11px] font-semibold tracking-[0.14em] text-night-muted uppercase">
                {column.title}
              </h3>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link href={link.href} className="text-sm text-night-muted transition hover:text-brand-500">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-night-line pt-5 text-xs text-night-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Shiv Radium. All rights reserved.</p>
          <p>Made to order in India · GST invoice on every order</p>
        </div>
      </div>
    </footer>
  );
}
