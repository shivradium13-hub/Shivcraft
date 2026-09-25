import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { InvoicePrintButton } from "@/components/shop/InvoicePrintButton";
import { computeInvoiceTax, sameState } from "@/lib/gst";
import { formatPaise } from "@/lib/money";
import { getCurrentUser } from "@/server/auth/session";
import { getOrderForInvoice } from "@/server/orders/queries";
import { getAllSettings } from "@/server/settings/shop";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Invoice",
  robots: { index: false, follow: false },
};

const PAYMENT_LABEL: Record<string, string> = {
  PENDING: "Awaiting payment",
  AUTHORIZED: "Authorised",
  PAID: "Paid",
  FAILED: "Payment failed",
  REFUNDED: "Refunded",
  COD_PENDING: "Cash on delivery",
};

/** A one-line description of what the customer personalised on a line, drawn
 *  from the frozen order snapshot — never from the product as it is now. */
function customisationSummary(customization: unknown): string | null {
  if (!customization || typeof customization !== "object") return null;
  const parts: string[] = [];
  for (const answer of Object.values(customization as Record<string, { label?: string; type?: string; value?: string }>)) {
    if (!answer?.label) continue;
    parts.push(`${answer.label}: ${answer.type === "IMAGE" ? "photo" : (answer.value ?? "")}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

export default async function InvoicePage(props: PageProps<"/invoice/[orderNumber]">) {
  const { orderNumber } = await props.params;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/invoice/${orderNumber}`);

  const order = await getOrderForInvoice(orderNumber, { id: user.id, role: user.role });
  if (!order) notFound();

  const { business, tax } = await getAllSettings();

  const interState = business.state ? !sameState(business.state, order.shipState) : false;
  const gst = computeInvoiceTax({
    subtotalP: order.subtotalP,
    discountP: order.discountP,
    shippingP: order.shippingP,
    totalP: order.totalP,
    storedTaxP: order.taxP,
    rate: tax.gstPercent,
    pricesIncludeTax: tax.pricesIncludeTax,
    interState,
  });

  const hasGstin = Boolean(business.gstin);
  const isTaxInvoice = hasGstin && gst.mode !== "none";
  const sellerName = business.legalName || "Shiv Radium";
  const sellerAddress = [business.line1, business.line2, business.city, business.state, business.pincode]
    .filter(Boolean)
    .join(", ");

  const paid = order.payment?.status === "PAID";

  return (
    <main className="min-h-dvh bg-sr-canvas px-4 py-6 text-sr-ink print:bg-white print:p-0">
      <div className="mx-auto max-w-[820px]">
        {/* Toolbar — hidden when printing. */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link
            href={user.role === "ADMIN" ? `/admin/orders/${order.orderNumber}` : `/order/${order.orderNumber}`}
            className="text-sm font-semibold text-sr-600 hover:underline"
          >
            ← Back to order
          </Link>
          <InvoicePrintButton />
        </div>

        {/* The invoice itself. */}
        <article className="rounded-card border border-sr-line bg-white p-6 shadow-card sm:p-9 print:rounded-none print:border-0 print:p-0 print:shadow-none">
          {/* header */}
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-sr-line pb-5">
            <div>
              <h1 className="font-display text-2xl font-semibold text-sr-ink">{sellerName}</h1>
              {sellerAddress ? (
                <p className="mt-1 max-w-xs text-xs text-sr-muted">{sellerAddress}</p>
              ) : null}
              <div className="mt-1 space-y-0.5 text-xs text-sr-muted">
                {business.gstin ? (
                  <p>
                    GSTIN: <span className="font-medium text-sr-body">{business.gstin}</span>
                  </p>
                ) : null}
                {business.pan ? <p>PAN: {business.pan}</p> : null}
                {business.email ? <p>{business.email}</p> : null}
                {business.phone ? <p>{business.phone}</p> : null}
              </div>
            </div>
            <div className="text-right">
              <p className="font-display text-lg font-semibold tracking-wide text-sr-600 uppercase">
                {isTaxInvoice ? "Tax Invoice" : "Invoice"}
              </p>
              <dl className="mt-2 space-y-0.5 text-xs text-sr-muted">
                <div className="flex justify-end gap-2">
                  <dt>Invoice No.</dt>
                  <dd className="font-medium text-sr-body">{order.orderNumber}</dd>
                </div>
                <div className="flex justify-end gap-2">
                  <dt>Date</dt>
                  <dd className="font-medium text-sr-body">
                    {new Date(order.placedAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </dd>
                </div>
                <div className="flex justify-end gap-2">
                  <dt>Status</dt>
                  <dd className={`font-semibold ${paid ? "text-success" : "text-sr-body"}`}>
                    {order.payment ? PAYMENT_LABEL[order.payment.status] ?? order.payment.status : "—"}
                    {order.payment ? ` · ${order.payment.method}` : ""}
                  </dd>
                </div>
              </dl>
            </div>
          </header>

          {/* parties */}
          <section className="grid gap-6 border-b border-sr-line py-5 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-sr-muted uppercase">Bill to</p>
              <p className="mt-1.5 text-sm font-medium text-sr-ink">
                {order.customerBusinessName || order.shipName}
              </p>
              {order.customerBusinessName ? (
                <p className="text-sm text-sr-body">{order.shipName}</p>
              ) : null}
              <p className="text-xs text-sr-muted">{order.shipPhone}</p>
              {order.customerGstin ? (
                <p className="mt-1 text-xs text-sr-body">
                  GSTIN: <span className="font-medium">{order.customerGstin}</span>
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-sr-muted uppercase">Ship to</p>
              <address className="mt-1.5 text-sm not-italic text-sr-body">
                <span className="font-medium text-sr-ink">{order.shipName}</span>
                <br />
                {[order.shipLine1, order.shipLine2, order.shipArea].filter(Boolean).join(", ")}
                <br />
                {order.shipCity}, {order.shipState} — {order.shipPincode}
              </address>
              {gst.mode !== "none" ? (
                <p className="mt-1 text-xs text-sr-muted">
                  Place of supply: {order.shipState}
                  {gst.interState ? " (inter-state · IGST)" : " (intra-state · CGST + SGST)"}
                </p>
              ) : null}
            </div>
          </section>

          {/* line items */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-sr-line text-left text-[11px] tracking-wide text-sr-muted uppercase">
                  <th className="py-2 pr-2 font-semibold">#</th>
                  <th className="py-2 pr-2 font-semibold">Description</th>
                  <th className="py-2 pr-2 text-right font-semibold">Qty</th>
                  <th className="py-2 pr-2 text-right font-semibold">Rate</th>
                  <th className="py-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item, i) => {
                  const summary = customisationSummary(item.customization);
                  return (
                    <tr key={item.id} className="border-b border-sr-line align-top">
                      <td className="py-2.5 pr-2 text-sr-muted tabular-nums">{i + 1}</td>
                      <td className="py-2.5 pr-2">
                        <p className="font-medium text-sr-ink">{item.productName}</p>
                        {item.variantLabel ? (
                          <p className="text-xs text-sr-muted">{item.variantLabel}</p>
                        ) : null}
                        {summary ? <p className="text-xs text-sr-muted">{summary}</p> : null}
                      </td>
                      <td className="py-2.5 pr-2 text-right tabular-nums">{item.quantity}</td>
                      <td className="py-2.5 pr-2 text-right tabular-nums">{formatPaise(item.unitPriceP)}</td>
                      <td className="py-2.5 text-right font-medium tabular-nums">
                        {formatPaise(item.lineTotalP)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* totals */}
          <div className="mt-4 flex justify-end">
            <dl className="w-full max-w-xs space-y-1.5 text-sm">
              <Row label="Subtotal">{formatPaise(order.subtotalP)}</Row>
              {order.discountP > 0 ? (
                <Row label={`Discount${order.couponCode ? ` (${order.couponCode})` : ""}`} good>
                  −{formatPaise(order.discountP)}
                </Row>
              ) : null}

              {gst.mode !== "none" ? (
                <>
                  <Row label="Taxable value">{formatPaise(gst.taxableValueP)}</Row>
                  {gst.interState ? (
                    <Row label={`IGST @ ${gst.rate}%`}>{formatPaise(gst.igstP)}</Row>
                  ) : (
                    <>
                      <Row label={`CGST @ ${gst.rate / 2}%`}>{formatPaise(gst.cgstP)}</Row>
                      <Row label={`SGST @ ${gst.rate / 2}%`}>{formatPaise(gst.sgstP)}</Row>
                    </>
                  )}
                </>
              ) : null}

              <Row label="Delivery">
                {order.shippingP === 0 ? "FREE" : formatPaise(order.shippingP)}
              </Row>

              <div className="mt-1 flex justify-between border-t border-sr-line-strong pt-2 text-base font-semibold text-sr-ink">
                <dt>Grand total</dt>
                <dd className="tabular-nums">{formatPaise(order.totalP)}</dd>
              </div>
            </dl>
          </div>

          {/* notes */}
          <footer className="mt-6 border-t border-sr-line pt-4 text-xs text-sr-muted">
            {gst.mode === "inclusive" && gst.gstP > 0 ? (
              <p>
                Prices are inclusive of GST. The tax shown above is the GST component contained in the
                total — it has not been added on top.
              </p>
            ) : null}
            {!isTaxInvoice && gst.mode !== "none" ? (
              <p className="mt-1">
                GST is shown for reference. This is not a tax invoice as no GSTIN is on file for the
                seller.
              </p>
            ) : null}
            <p className="mt-1">
              This is a computer-generated invoice for order {order.orderNumber} and is valid without a
              signature.
            </p>
          </footer>
        </article>
      </div>
    </main>
  );
}

function Row({ label, children, good }: { label: string; children: React.ReactNode; good?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-sr-muted">{label}</dt>
      <dd className={`tabular-nums ${good ? "font-semibold text-success" : "text-sr-body"}`}>
        {children}
      </dd>
    </div>
  );
}
