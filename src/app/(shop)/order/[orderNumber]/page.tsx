import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { formatPaise } from "@/lib/money";
import { getCurrentUser } from "@/server/auth/session";
import { TRACKING_STEPS, getOrderForUser } from "@/server/orders/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your order",
  robots: { index: false, follow: false },
};

const PAYMENT_LABEL: Record<string, string> = {
  PENDING: "Awaiting payment",
  AUTHORIZED: "Authorised",
  PAID: "Paid",
  FAILED: "Payment failed",
  REFUNDED: "Refunded",
  COD_PENDING: "Pay on delivery",
};

export default async function OrderPage(props: PageProps<"/order/[orderNumber]">) {
  const { orderNumber } = await props.params;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/order/${orderNumber}`);

  const order = await getOrderForUser(orderNumber, user.id);
  if (!order) notFound();

  const cancelled = order.status === "CANCELLED";
  const reachedIndex = TRACKING_STEPS.findIndex((s) => s.key === order.status);
  const paid = order.payment?.status === "PAID";
  const awaitingPayment = order.payment?.status === "PENDING" || order.payment?.status === "FAILED";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-card border border-line bg-paper p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.12em] text-success uppercase">
              {cancelled ? "Cancelled" : "Order placed"}
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-ink">
              {order.orderNumber}
            </h1>
            <p className="mt-1 text-sm text-muted">
              Placed on{" "}
              {new Date(order.placedAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <div className="text-right">
            <p className="font-display text-2xl font-semibold tabular-nums">
              {formatPaise(order.totalP)}
            </p>
            <p
              className={`mt-0.5 text-xs font-semibold ${
                paid ? "text-success" : awaitingPayment ? "text-warn" : "text-muted"
              }`}
            >
              {order.payment ? PAYMENT_LABEL[order.payment.status] : "—"}
              {order.payment ? ` · ${order.payment.method}` : ""}
            </p>
          </div>
        </div>

        {awaitingPayment ? (
          <p className="mt-4 rounded-lg bg-brand-50 px-3 py-2.5 text-sm text-brand-800">
            This order is saved but not paid for yet. Your items are reserved.
          </p>
        ) : null}

        {/* --------------------------------------------------- timeline */}
        {!cancelled ? (
          <ol className="mt-6 space-y-0">
            {TRACKING_STEPS.map((step, i) => {
              const done = i <= reachedIndex;
              const current = i === reachedIndex;
              const event = order.events.find((e) => e.status === step.key);
              return (
                <li key={step.key} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[10px] ${
                        done
                          ? "border-success bg-success text-white"
                          : "border-field bg-field-bg text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    {i < TRACKING_STEPS.length - 1 ? (
                      <span
                        className={`w-0.5 flex-1 ${i < reachedIndex ? "bg-success" : "bg-line"}`}
                        style={{ minHeight: 24 }}
                      />
                    ) : null}
                  </div>
                  <div className="pb-4">
                    <p
                      className={`text-sm ${
                        current ? "font-semibold text-ink" : done ? "text-ink-soft" : "text-muted"
                      }`}
                    >
                      {step.label}
                    </p>
                    {event ? (
                      <p className="text-xs text-muted">
                        {new Date(event.createdAt).toLocaleString("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {event.note ? ` · ${event.note}` : ""}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="mt-5 rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger">
            This order was cancelled{order.cancelReason ? `: ${order.cancelReason}` : "."}
          </p>
        )}
      </div>

      {/* ------------------------------------------------------ items */}
      <section className="mt-4 rounded-card border border-line bg-paper p-5">
        <h2 className="font-display text-lg font-semibold text-ink">
          {order.items.length} item{order.items.length === 1 ? "" : "s"}
        </h2>
        <ul className="mt-3 divide-y divide-line">
          {order.items.map((item) => (
            <li key={item.id} className="flex gap-3 py-3 text-sm">
              <div className="min-w-0 flex-1">
                {item.productSlug ? (
                  <Link href={`/product/${item.productSlug}`} className="font-medium text-ink hover:text-brand-700">
                    {item.productName}
                  </Link>
                ) : (
                  <span className="font-medium text-ink">{item.productName}</span>
                )}
                {item.variantLabel ? (
                  <p className="text-xs text-muted">{item.variantLabel}</p>
                ) : null}
                {item.customization ? (
                  <ul className="mt-1 border-l-2 border-line pl-2 text-xs text-muted">
                    {Object.entries(item.customization).map(([key, answer]) => (
                      <li key={key}>
                        {answer.label}:{" "}
                        {answer.type === "IMAGE" ? (
                          <a
                            href={answer.value}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-brand-700 hover:underline"
                          >
                            view photo
                          </a>
                        ) : (
                          <span className="font-medium text-ink-soft">{answer.value}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-0.5 text-xs text-muted">Qty {item.quantity}</p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums">
                {formatPaise(item.lineTotalP)}
              </span>
            </li>
          ))}
        </ul>

        <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd className="tabular-nums">{formatPaise(order.subtotalP)}</dd>
          </div>
          {order.discountP > 0 ? (
            <div className="flex justify-between">
              <dt className="text-muted">Coupon {order.couponCode}</dt>
              <dd className="font-semibold text-success tabular-nums">
                −{formatPaise(order.discountP)}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt className="text-muted">Delivery</dt>
            <dd className="tabular-nums">
              {order.shippingP === 0 ? "FREE" : formatPaise(order.shippingP)}
            </dd>
          </div>
          <div className="flex justify-between border-t border-line-strong pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatPaise(order.totalP)}</dd>
          </div>
        </dl>
      </section>

      {/* -------------------------------------------------- shipping to */}
      <section className="mt-4 rounded-card border border-line bg-paper p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Delivering to</h2>
        <address className="mt-2 text-sm not-italic text-ink-soft">
          <span className="font-medium text-ink">{order.shipName}</span> · {order.shipPhone}
          <br />
          {[order.shipLine1, order.shipLine2, order.shipArea].filter(Boolean).join(", ")}
          <br />
          {order.shipCity}, {order.shipState} — {order.shipPincode}
        </address>
      </section>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href="/categories"
          className="rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Continue shopping
        </Link>
        <Link
          href={`/invoice/${order.orderNumber}`}
          className="rounded-full border border-line-strong px-5 py-2.5 text-sm font-semibold text-ink-soft transition hover:border-brand-300"
        >
          Download invoice
        </Link>
      </div>
    </div>
  );
}
