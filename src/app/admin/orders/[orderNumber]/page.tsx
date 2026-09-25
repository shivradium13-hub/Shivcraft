import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OrderStatusControl } from "@/components/admin/OrderStatusControl";
import { formatPaise } from "@/lib/money";
import { STATUS_LABEL, allowedNext, getAdminOrder } from "@/server/admin/orders";
import { OrderDesignPanel } from "@/components/admin/OrderDesignPanel";
import { requireAdmin } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: PageProps<"/admin/orders/[orderNumber]">,
): Promise<Metadata> {
  const { orderNumber } = await props.params;
  return { title: `Order ${orderNumber}`, robots: { index: false, follow: false } };
}

export default async function AdminOrderPage(props: PageProps<"/admin/orders/[orderNumber]">) {
  await requireAdmin();
  const { orderNumber } = await props.params;

  const order = await getAdminOrder(orderNumber);
  if (!order) notFound();

  const payment = order.payments[0] ?? null;
  const needsRefund =
    order.status === "CANCELLED" && payment?.status === "PAID" && payment.method !== "COD";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/orders" className="text-sm font-semibold text-sr-600 hover:underline">
          ← All orders
        </Link>
        <Link
          href={`/invoice/${order.orderNumber}`}
          className="rounded-full border border-sr-line-strong px-4 py-1.5 text-sm font-semibold text-sr-body transition hover:border-sr-400"
        >
          Invoice
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-sr-ink">{order.orderNumber}</h1>
          <p className="mt-1 text-sm text-sr-muted">
            Placed{" "}
            {new Date(order.placedAt).toLocaleString("en-IN", {
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-semibold tabular-nums">
            {formatPaise(order.totalP)}
          </p>
          <p className="text-xs font-semibold text-sr-muted">
            {STATUS_LABEL[order.status]} · {payment?.status ?? "no payment"} · {payment?.method ?? "—"}
          </p>
        </div>
      </div>

      {needsRefund ? (
        <p className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          This order was paid online and then cancelled. Issue the refund from your Razorpay
          dashboard — nothing here has refunded it automatically.
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="space-y-4">
          {/* --------------------------------------------------- items */}
          <section className="rounded-2xl border border-sr-line bg-sr-surface p-5">
            <h2 className="font-display text-lg font-semibold text-sr-ink">
              {order.items.length} item{order.items.length === 1 ? "" : "s"}
            </h2>

            <ul className="mt-3 divide-y divide-sr-line">
              {order.items.map((item) => (
                <li key={item.id} className="py-3">
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-sr-ink">{item.productName}</p>
                      {item.variantLabel ? (
                        <p className="text-xs text-sr-muted">{item.variantLabel}</p>
                      ) : null}
                      <p className="text-xs text-sr-muted">
                        Qty {item.quantity} · {formatPaise(item.unitPriceP)} each
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatPaise(item.lineTotalP)}
                    </p>
                  </div>

                  {/* The customizer design, rendered from the snapshot frozen
                      at checkout rather than from the product as it is now. */}
                  {item.design ? (
                    <OrderDesignPanel
                      raw={item.design}
                      lineLabel={item.productName}
                      orderNumber={order.orderNumber}
                      itemId={item.id}
                    />
                  ) : null}

                  {/* What the workshop actually needs to make it. */}
                  {item.customization ? (
                    <div className="mt-2.5 rounded-lg border border-sr-gold/30 bg-sr-gold-soft/50 p-3">
                      <p className="text-[11px] font-semibold tracking-wide text-sr-gold uppercase">
                        Customisation
                      </p>
                      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                        {Object.entries(item.customization).map(([key, answer]) => (
                          <div key={key}>
                            <dt className="text-[11px] text-sr-muted">{answer.label}</dt>
                            <dd className="text-sm font-medium text-sr-ink">
                              {answer.type === "IMAGE" ? (
                                <a
                                  href={answer.value}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 text-sr-600 hover:underline"
                                >
                                  {/* Private blob, served through the proxy —
                                      readable here because the viewer is ADMIN. */}
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={answer.value}
                                    alt="Customer upload"
                                    className="h-14 w-14 rounded-md border border-sr-line object-cover"
                                  />
                                  Open full size
                                </a>
                              ) : (
                                answer.value
                              )}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>

            <dl className="mt-3 space-y-1.5 border-t border-sr-line pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-sr-muted">Subtotal</dt>
                <dd className="tabular-nums">{formatPaise(order.subtotalP)}</dd>
              </div>
              {order.discountP > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-sr-muted">Coupon {order.couponCode}</dt>
                  <dd className="font-semibold text-success tabular-nums">
                    −{formatPaise(order.discountP)}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-sr-muted">Delivery</dt>
                <dd className="tabular-nums">
                  {order.shippingP === 0 ? "FREE" : formatPaise(order.shippingP)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-sr-line-strong pt-2 font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatPaise(order.totalP)}</dd>
              </div>
            </dl>
          </section>

          {/* ------------------------------------------------- timeline */}
          <section className="rounded-2xl border border-sr-line bg-sr-surface p-5">
            <h2 className="font-display text-lg font-semibold text-sr-ink">History</h2>
            <ol className="mt-3 space-y-3">
              {order.events.map((event) => (
                <li key={event.id} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sr-400" />
                  <div>
                    <p className="font-medium text-sr-ink">{STATUS_LABEL[event.status]}</p>
                    <p className="text-xs text-sr-muted">
                      {new Date(event.createdAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {event.note ? ` · ${event.note}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* ------------------------------------------------------ sidebar */}
        <div className="space-y-4">
          <section className="rounded-2xl border border-sr-line bg-sr-surface p-5">
            <h2 className="font-display text-base font-semibold text-sr-ink">Update status</h2>
            <p className="mt-0.5 mb-3 text-xs text-sr-muted">
              The customer sees this on their tracking page immediately.
            </p>
            <OrderStatusControl
              orderNumber={order.orderNumber}
              current={order.status}
              options={allowedNext(order.status)}
              labels={STATUS_LABEL}
            />
          </section>

          <section className="rounded-2xl border border-sr-line bg-sr-surface p-5">
            <h2 className="font-display text-base font-semibold text-sr-ink">Customer</h2>
            <dl className="mt-2.5 space-y-1.5 text-sm">
              <div>
                <dt className="text-xs text-sr-muted">Name</dt>
                <dd className="font-medium text-sr-ink">{order.customer.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-sr-muted">Email</dt>
                <dd className="break-all text-sr-body">{order.customer.email}</dd>
              </div>
              {order.customer.phone ? (
                <div>
                  <dt className="text-xs text-sr-muted">Phone</dt>
                  <dd className="text-sr-body">{order.customer.phone}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs text-sr-muted">Orders placed</dt>
                <dd className="text-sr-body tabular-nums">{order.customer.orderCount}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-sr-line bg-sr-surface p-5">
            <h2 className="font-display text-base font-semibold text-sr-ink">Ship to</h2>
            <address className="mt-2 text-sm not-italic text-sr-body">
              <span className="font-medium text-sr-ink">{order.shipName}</span>
              <br />
              {order.shipPhone}
              <br />
              {[order.shipLine1, order.shipLine2, order.shipArea].filter(Boolean).join(", ")}
              <br />
              {order.shipCity}, {order.shipState} — {order.shipPincode}
            </address>
          </section>

          {payment ? (
            <section className="rounded-2xl border border-sr-line bg-sr-surface p-5">
              <h2 className="font-display text-base font-semibold text-sr-ink">Payment</h2>
              <dl className="mt-2.5 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-sr-muted">Method</dt>
                  <dd>{payment.method}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sr-muted">Status</dt>
                  <dd className="font-semibold">{payment.status}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sr-muted">Amount</dt>
                  <dd className="tabular-nums">{formatPaise(payment.amountP)}</dd>
                </div>
                {payment.gatewayPaymentId ? (
                  <div>
                    <dt className="text-xs text-sr-muted">Razorpay payment id</dt>
                    <dd className="break-all font-mono text-xs">{payment.gatewayPaymentId}</dd>
                  </div>
                ) : null}
                {payment.failureReason ? (
                  <p className="text-xs font-medium text-danger">{payment.failureReason}</p>
                ) : null}
              </dl>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
