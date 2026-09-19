# Shiv Radium

An e-commerce shop for personalised gifts — name plates, photo frames, photo mugs,
handmade crafts and CNC-cut pieces — with the customer storefront and the owner's
admin panel running off one Postgres database.

Everything in the UI is wired to that database. There are no buttons that only look
like they work, no faked order or payment states, and no invented numbers: where a
figure cannot be read from the data, the page says so instead of showing a placeholder.

---

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19 |
| Styling | Tailwind CSS 4, design tokens in `src/app/globals.css` |
| Database | Neon Postgres, Drizzle ORM over the `@neondatabase/serverless` WebSocket driver |
| Files | Vercel Blob, one private store with a `visibility` column |
| Payments | Razorpay, called over REST with HMAC-SHA256 signature checks |
| Auth | scrypt password hashing, server-side sessions in Postgres |
| Validation | Zod, on the server for every write |

The WebSocket driver rather than the HTTP one because placing an order needs a real
interactive transaction — stock is decremented and the order written together, or
neither happens.

---

## Getting started

Requires **Node 22+** and pnpm, plus a **Neon** Postgres database.

Node 22 because the database client uses the global `WebSocket`; on older Node the
`ws` package has to be installed and passed to `neonConfig`. Neon specifically because
the client is `@neondatabase/serverless`, which talks to Neon's WebSocket endpoint —
plain Postgres needs either a WebSocket proxy in front of it or a swap to `node-postgres`
in `src/server/db/index.ts`.

```bash
pnpm install
```

Copy the example environment file and fill in at least `DATABASE_URL`:

```bash
cp .env.example .env.local
```

Create the tables, then load the demo catalogue:

```bash
pnpm db:push
pnpm db:seed
```

The seed prints the admin email and a generated password at the end. Set
`SEED_ADMIN_PASSWORD` in `.env.local` beforehand if you want to choose your own.

```bash
pnpm dev
```

The storefront is at `http://localhost:3000`, the admin at `/admin`.

### Re-seeding

`pnpm db:seed` refuses to run if the database already holds orders, because it
truncates the catalogue and that would cascade into order history. Pass `--wipe`
only when you genuinely mean to erase everything:

```bash
pnpm db:seed -- --wipe
```

---

## Environment variables

| Variable | Required | What it does |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `BLOB_READ_WRITE_TOKEN` | for uploads | Vercel Blob store token. Without it, image upload fails; the rest of the shop works |
| `RAZORPAY_KEY_ID` | for online payment | Razorpay API key |
| `RAZORPAY_KEY_SECRET` | for online payment | Used to verify the payment signature. Never sent to the browser |
| `NEXT_PUBLIC_SITE_URL` | for correct metadata | Canonical origin used in OG tags and canonical links |
| `SEED_ADMIN_EMAIL` | no | Admin account the seed creates. Defaults to `admin@shivradium.local` |
| `SEED_ADMIN_PASSWORD` | no | Chosen admin password; a random one is generated and printed if unset |
| `SEED_DEMO_PASSWORD` | no | Password for the demo customer account |

**With no Razorpay keys the online payment methods are disabled in the checkout UI
rather than shown and then failing.** Cash on delivery still works, so the whole
order flow can be exercised without a gateway account.

---

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build and serve |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm db:push` | Push the Drizzle schema to the database |
| `pnpm db:generate` / `pnpm db:migrate` | Generate and apply SQL migrations |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm db:seed` | Load the demo catalogue and accounts |
| `pnpm verify:security` | Asserts the credential-storage invariants; exits non-zero on a regression, so it can sit in CI |

---

## Layout

```
src/
  app/
    (shop)/          storefront — home, category, product, cart, checkout, account, support
    categories/      the two-pane category browser
    admin/           dashboard, orders, products, categories, reviews, coupons, banners,
                     customers, settings
    api/             every endpoint; admin routes live under /api/admin
  components/
    shop/  admin/  categories/  auth/  ui/
  server/
    auth/            sessions, password hashing, route guards
    catalog/         product and category reads for the storefront
    cart/            cart reads and coupon pricing
    orders/          order placement, the transactional path
    payments/        Razorpay
    admin/           admin-only queries
    reviews/         review service and moderation
    settings/        shop settings, one reader for the whole app
    db/              schema and seed
  lib/               money helpers, Zod schemas
```

---

## Conventions worth knowing before changing anything

**Money is integer paise, everywhere.** ₹549.00 is `54900`. Columns end in `P`
(`priceP`, `totalP`). Format with `formatPaise()` from `src/lib/money.ts`. Nothing
holds a currency float.

**Passwords are scrypt hashes**, format `scrypt$N$r$p$salt$key`. Sessions are stored
as a SHA-256 of the cookie token, so a database leak cannot be replayed as a login —
and sessions are revocable, which is what makes blocking an account take effect on
the customer's next request.

**Deletes that would orphan financial history are refused, not cascaded.** Deleting a
product that appears in orders, a coupon that has been redeemed, a customer who has
ordered, or a category that still holds products each return a written explanation
pointing at deactivating instead.

**Stock is taken with a conditional update**, not read-then-write:

```ts
.where(and(eq(products.id, line.productId), sql`${products.stock} >= ${line.quantity}`))
```

If no row comes back, someone else took the last one between the cart read and the
transaction, and the order fails with an out-of-stock message rather than overselling.

**Coupons are re-checked when the order is placed**, not trusted from the cart, and the
discount is always computed server-side.

### One Drizzle trap that bites silently

In a query with **no join**, Drizzle renders `${table.id}` inside a raw `sql` fragment
as a bare `"id"`. Inside a correlated subquery that binds to the *subquery's* table, so
the correlation matches nothing — and returns wrong data rather than erroring. Write
the table name out:

```ts
// not ${categories.id}
sql`(SELECT count(*)::int FROM products p WHERE p.category_id = "categories"."id")`
```

Every correlated subquery in `src/server/` either sits in a joined query or spells the
table out for this reason.

---

## Admin panel

Reached at `/admin`, guarded on the server for every request under that path. A
signed-out visitor is sent to sign in; a signed-in customer is redirected away, which
does not confirm that an admin area exists there. Every `/api/admin/*` route calls
`requireAdmin()` as its first statement.

Dashboard · Orders · Products · Categories · Reviews · Coupons · Banners · Customers ·
Settings.

Customer management refuses to let an admin block themselves, remove their own admin
access, or delete the account they are signed in with — each would end the session on
the next request with no way back in from inside the app.

---

## What is not built

Stated here rather than hinted at in the UI:

- **No email or SMS.** Notifications are in-app only, on the account page. There is no
  mail provider wired up, so order updates do not leave the site.
- **Razorpay has never been called live from this codebase.** The integration and the
  signature verification are written against the documented Orders API, but no keys have
  been configured here and no real payment has been taken. Watch the first transaction
  in Razorpay's test mode.
- **There is no test suite.** Verification so far has been by exercising the running
  app — the API directly and the UI in a browser — not by automated tests.
- **Refunds are not issued from the admin.** Cancelling a paid order shows the owner a
  banner telling them to refund in the Razorpay dashboard. The order is not marked
  refunded, because claiming a refund the system did not make would be false in the
  records.
- **Shipping is a flat rate plus a free-delivery threshold.** There is no courier
  integration and no live tracking; the PIN-code estimate is computed from postal
  regions, and says so.

---

## Deployment

Built for Vercel. Set the environment variables above in the project, point
`DATABASE_URL` at the production database, run `pnpm db:push` against it once, and
deploy. Run the seed against production only if you actually want the demo catalogue
there — the demo reviews are the only reviews with no linked order, which is how to
find and remove them later.
