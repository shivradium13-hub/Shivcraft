import type { Metadata } from "next";
import Link from "next/link";

import { formatPaise } from "@/lib/money";
import { getCurrentUser } from "@/server/auth/session";
import { getAllSettings } from "@/server/settings/shop";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Help & Support",
  description: "Order help, delivery times, returns and how to reach us.",
  alternates: { canonical: "/support" },
};

/**
 * The page the footer and the account menu have always linked to.
 *
 * Contact channels come from shop settings, and a channel with nothing behind
 * it is left out rather than printed blank — a customer should never be given
 * an address or a number that nobody reads.
 */
export default async function SupportPage() {
  const [{ shipping, tax, support }, user] = await Promise.all([
    getAllSettings(),
    getCurrentUser(),
  ]);

  const channels = [
    support.email
      ? {
          label: "Email",
          value: support.email,
          href: `mailto:${support.email}`,
          note: "Best for anything with a photo or a proof attached.",
        }
      : null,
    support.phone
      ? {
          label: "Phone",
          value: support.phone,
          href: `tel:${support.phone.replace(/[^\d+]/g, "")}`,
          note: support.hours || undefined,
        }
      : null,
    support.whatsapp
      ? {
          label: "WhatsApp",
          value: support.whatsapp,
          href: `https://wa.me/${support.whatsapp.replace(/\D/g, "")}`,
          note: "Quickest for a photo of what arrived.",
        }
      : null,
  ].filter((channel) => channel !== null);

  return (
    <div className="mx-auto max-w-3xl pb-6">
      <h1 className="font-display text-2xl font-semibold text-ink sm:text-3xl">Help &amp; Support</h1>
      <p className="mt-2 max-w-prose text-sm text-ink-soft">
        Most questions are about where an order is, how long something takes to make, or a
        personalisation that needs changing. Those are all below.
      </p>

      <section className="mt-6">
        <h2 className="font-display text-lg font-semibold text-ink">Your orders</h2>
        {user ? (
          <p className="mt-1 text-sm text-ink-soft">
            Every order, its current stage and its invoice are in{" "}
            <Link href="/account/orders" className="font-semibold text-brand-700 hover:underline">
              My Orders
            </Link>
            .
          </p>
        ) : (
          <p className="mt-1 text-sm text-ink-soft">
            <Link
              href="/login?next=/account/orders"
              className="font-semibold text-brand-700 hover:underline"
            >
              Sign in
            </Link>{" "}
            to see your orders and track them.
          </p>
        )}
      </section>

      <section className="mt-6">
        <h2 className="font-display text-lg font-semibold text-ink">Talk to us</h2>
        {channels.length === 0 ? (
          /* Said plainly rather than inventing a helpline. */
          <p className="mt-2 rounded-card border border-dashed border-field bg-paper px-4 py-4 text-sm text-muted">
            We have not published a contact channel yet. If you have an order with us, the fastest
            route is the order page in your account, which shows exactly where it has reached.
          </p>
        ) : (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {channels.map((channel) => (
              <li key={channel.label} className="rounded-card border border-line bg-paper p-4">
                <p className="text-xs font-semibold tracking-wide text-muted uppercase">
                  {channel.label}
                </p>
                <a
                  href={channel.href}
                  className="mt-1 block text-sm font-semibold break-words text-brand-700 hover:underline"
                >
                  {channel.value}
                </a>
                {channel.note ? (
                  <p className="mt-1 text-xs text-muted">{channel.note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {support.hours && !support.phone ? (
          <p className="mt-2 text-xs text-muted">{support.hours}</p>
        ) : null}
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold text-ink">Delivery and charges</h2>
        {/* Read from the same settings the cart prices with, so this page
            cannot quote a delivery charge the checkout disagrees with. */}
        <dl className="mt-2 overflow-hidden rounded-card border border-line">
          <Fact label="Delivery charge">
            {shipping.flatRateP === 0
              ? "Free on every order."
              : `${formatPaise(shipping.flatRateP)} per order.`}
          </Fact>
          {shipping.flatRateP > 0 && shipping.freeAboveP > 0 ? (
            <Fact label="Free delivery">
              On orders of {formatPaise(shipping.freeAboveP)} or more.
            </Fact>
          ) : null}
          <Fact label="Cash on delivery">
            {shipping.codEnabled
              ? "Available on most PIN codes. The product page checks yours."
              : "Not available — orders are paid online."}
          </Fact>
          <Fact label="GST">
            {tax.pricesIncludeTax
              ? `Included in the price shown (${tax.gstPercent}%). Nothing is added at checkout.`
              : `${tax.gstPercent}% is added at checkout and shown as a separate line.`}
          </Fact>
          <Fact label="How long">
            Personalised pieces are made to order. Enter your PIN code on any product page for that
            item&rsquo;s estimate.
          </Fact>
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold text-ink">Common questions</h2>
        <div className="mt-2 grid gap-3">
          <Faq question="Can I change the name or photo after ordering?">
            Yes, while the order still reads Placed or Confirmed. Once it moves to Personalised the
            piece has been engraved or printed and cannot be changed. Get in touch quickly and we
            will do what we can.
          </Faq>
          <Faq question="Can I cancel?">
            An order can be cancelled from{" "}
            <Link href="/account/orders" className="font-semibold text-brand-700 hover:underline">
              My Orders
            </Link>{" "}
            until it is packed. After that it is on its way and cancelling is no longer possible
            from the site.
          </Faq>
          <Faq question="Something arrived damaged.">
            Send a photo through whichever channel above is quickest. Damage in transit is on us
            and we will remake or refund it.
          </Faq>
          <Faq question="Can a personalised item be returned?">
            A piece made with your name, photo or message cannot be resold, so it is not returnable
            unless it arrived damaged or does not match the proof you approved.
          </Faq>
          <Faq question="When does a refund reach me?">
            Once we have issued it, an online refund takes three to seven working days to appear,
            depending on your bank. The order page shows when it was issued.
          </Faq>
        </div>
      </section>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-line px-4 py-3 text-sm last:border-b-0">
      <dt className="w-40 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink">{children}</dd>
    </div>
  );
}

function Faq({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <details className="rounded-card border border-line bg-paper px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-ink">{question}</summary>
      <div className="mt-2 text-sm text-ink-soft">{children}</div>
    </details>
  );
}
