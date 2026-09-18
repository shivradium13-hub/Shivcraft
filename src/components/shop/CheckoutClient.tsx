"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatPaise } from "@/lib/money";
import type { CartView } from "@/server/cart/queries";

import { notifyCartChanged } from "./CartBadge";
import { ProductImage } from "../ui/primitives";

export type SavedAddress = {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  area: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
};

type Method = "UPI" | "CARD" | "NETBANKING" | "WALLET" | "COD";

type RazorpayHandlerResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description: string;
  handler: (response: RazorpayHandlerResponse) => void;
  prefill: { name: string; email: string; contact: string };
  theme: { color: string };
  modal: { ondismiss: () => void };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

/** Loaded only when an online payment is actually started. */
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const STEPS = ["Address", "Order summary", "Payment"] as const;

export function CheckoutClient({
  cart,
  addresses: initialAddresses,
  customer,
  onlineEnabled,
}: {
  cart: CartView;
  addresses: SavedAddress[];
  customer: { name: string; email: string; phone: string | null };
  onlineEnabled: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [addresses, setAddresses] = useState(initialAddresses);
  const [addressId, setAddressId] = useState(
    initialAddresses.find((a) => a.isDefault)?.id ?? initialAddresses[0]?.id ?? "",
  );
  const [adding, setAdding] = useState(initialAddresses.length === 0);
  const [method, setMethod] = useState<Method>(onlineEnabled ? "UPI" : "COD");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = addresses.find((a) => a.id === addressId) ?? null;

  async function saveAddress(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      const body = Object.fromEntries(form.entries());
      const res = await fetch("/api/addresses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, isDefault: addresses.length === 0 }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(
          json?.error?.fields
            ? Object.values(json.error.fields as Record<string, string>)[0]
            : (json?.error?.message ?? "Could not save that address."),
        );
        return;
      }
      setAddresses((prev) => [...prev, json.data.address]);
      setAddressId(json.data.address.id);
      setAdding(false);
    } catch {
      setError("Network problem — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function payNow() {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/checkout/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ addressId, method }),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json?.error?.message ?? "We could not place your order.");
        return;
      }

      const { orderNumber, requiresPayment, razorpay } = json.data;

      if (!requiresPayment) {
        notifyCartChanged();
        router.replace(`/order/${orderNumber}`);
        return;
      }

      const ready = await loadRazorpayScript();
      if (!ready || !window.Razorpay) {
        setError(
          `Order ${orderNumber} was created but the payment window could not load. Open the order to pay again.`,
        );
        return;
      }

      const checkout = new window.Razorpay({
        key: razorpay.keyId,
        amount: razorpay.amount,
        currency: razorpay.currency,
        order_id: razorpay.orderId,
        name: "Shiv Radium",
        description: `Order ${orderNumber}`,
        prefill: {
          name: customer.name,
          email: customer.email,
          contact: customer.phone ?? "",
        },
        theme: { color: "#e35d24" },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setError(
              `Payment was cancelled. Order ${orderNumber} is saved — open it from My Orders to pay.`,
            );
          },
        },
        handler: async (response) => {
          // Nothing is confirmed here. The server verifies the signature and
          // is the only thing that can mark the order paid.
          const verify = await fetch("/api/checkout/verify", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              orderNumber,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            }),
          });
          const verified = await verify.json();

          if (!verify.ok) {
            setBusy(false);
            setError(verified?.error?.message ?? "We could not verify that payment.");
            return;
          }
          notifyCartChanged();
          router.replace(`/order/${orderNumber}`);
        },
      });

      checkout.open();
    } catch {
      setError("Network problem — check your connection and try again.");
    } finally {
      if (method === "COD") setBusy(false);
    }
  }

  const input =
    "w-full rounded-lg border border-line-strong bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-brand-500";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px] lg:items-start">
      <div>
        {/* ------------------------------------------------------ stepper */}
        <ol className="mb-5 flex items-center gap-2 text-xs">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => i < step && setStep(i)}
                disabled={i > step}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold transition ${
                  i === step
                    ? "bg-brand-700 text-white"
                    : i < step
                      ? "bg-brand-50 text-brand-700 hover:bg-brand-100"
                      : "bg-surface-2 text-muted"
                }`}
              >
                <span className="tabular-nums">{i + 1}</span> {label}
              </button>
              {i < STEPS.length - 1 ? <span className="text-line-strong">—</span> : null}
            </li>
          ))}
        </ol>

        {error ? (
          <p role="alert" className="mb-4 rounded-lg bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}

        {/* ------------------------------------------------ step 1 address */}
        {step === 0 ? (
          <section className="rounded-card border border-line bg-paper p-5">
            <h2 className="font-display text-lg font-semibold text-ink">Delivery address</h2>

            {addresses.length > 0 && !adding ? (
              <>
                <div className="mt-4 space-y-2">
                  {addresses.map((address) => (
                    <label
                      key={address.id}
                      className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition ${
                        addressId === address.id
                          ? "border-brand-600 bg-brand-50"
                          : "border-line hover:border-brand-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="address"
                        checked={addressId === address.id}
                        onChange={() => setAddressId(address.id)}
                        className="mt-1 h-4 w-4 shrink-0 accent-brand-700"
                      />
                      <span className="min-w-0 text-sm">
                        <span className="font-semibold text-ink">{address.fullName}</span>
                        <span className="ml-2 text-muted">{address.phone}</span>
                        <span className="mt-0.5 block text-ink-soft">
                          {[address.line1, address.line2, address.area, address.city, address.state]
                            .filter(Boolean)
                            .join(", ")}{" "}
                          — {address.pincode}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="mt-3 text-sm font-semibold text-brand-700 hover:underline"
                >
                  + Add a new address
                </button>
              </>
            ) : (
              <form
                className="mt-4 grid gap-3 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveAddress(new FormData(e.currentTarget));
                }}
              >
                <Field label="Full name" name="fullName" required className={input} defaultValue={customer.name} />
                <Field label="Mobile number" name="phone" required className={input} defaultValue={customer.phone ?? ""} />
                <Field label="House / flat" name="line1" required className={input} />
                <Field label="Street" name="line2" className={input} />
                <Field label="Area" name="area" className={input} />
                <Field label="City" name="city" required className={input} />
                <Field label="State" name="state" required className={input} />
                <Field label="PIN code" name="pincode" required className={input} inputMode="numeric" />
                <div className="sm:col-span-2 flex gap-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {busy ? "Saving…" : "Save address"}
                  </button>
                  {addresses.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setAdding(false)}
                      className="rounded-full border border-line-strong px-5 py-2.5 text-sm font-semibold text-ink-soft"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </form>
            )}

            {!adding ? (
              <button
                type="button"
                disabled={!addressId}
                onClick={() => setStep(1)}
                className="mt-5 rounded-full bg-brand-700 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-45"
              >
                Deliver here
              </button>
            ) : null}
          </section>
        ) : null}

        {/* ------------------------------------------------- step 2 review */}
        {step === 1 ? (
          <section className="rounded-card border border-line bg-paper p-5">
            <h2 className="font-display text-lg font-semibold text-ink">Order summary</h2>
            {selected ? (
              <p className="mt-1 text-xs text-muted">
                Delivering to {selected.fullName}, {selected.city} {selected.pincode}
              </p>
            ) : null}

            <ul className="mt-4 divide-y divide-line">
              {cart.items.map((line) => (
                <li key={line.id} className="flex gap-3 py-3">
                  <span className="relative h-16 w-14 shrink-0 overflow-hidden rounded-lg bg-brand-50">
                    <ProductImage src={line.imageUrl} alt={line.name} sizes="56px" />
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-medium text-ink">{line.name}</span>
                    {line.variantLabel ? (
                      <span className="block text-xs text-muted">{line.variantLabel}</span>
                    ) : null}
                    {line.customization ? (
                      <span className="mt-1 block text-xs text-muted">
                        {Object.values(line.customization)
                          .map((a) => `${a.label}: ${a.type === "IMAGE" ? "photo attached" : a.value}`)
                          .join(" · ")}
                      </span>
                    ) : null}
                    <span className="mt-0.5 block text-xs text-muted">Qty {line.quantity}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatPaise(line.lineTotalP)}
                  </span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => setStep(2)}
              className="mt-5 rounded-full bg-brand-700 px-6 py-2.5 text-sm font-semibold text-white"
            >
              Continue to payment
            </button>
          </section>
        ) : null}

        {/* ------------------------------------------------ step 3 payment */}
        {step === 2 ? (
          <section className="rounded-card border border-line bg-paper p-5">
            <h2 className="font-display text-lg font-semibold text-ink">Payment</h2>

            {!onlineEnabled ? (
              <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2.5 text-xs text-brand-800">
                Online payment is not switched on yet — the Razorpay keys are not set on this
                server. Cash on delivery works normally.
              </p>
            ) : null}

            <div className="mt-4 space-y-2">
              {(
                [
                  ["UPI", "UPI", "GPay, PhonePe, Paytm and any UPI app"],
                  ["CARD", "Credit / Debit card", "Visa, Mastercard, RuPay, Amex"],
                  ["NETBANKING", "Net banking", "All major Indian banks"],
                  ["WALLET", "Wallet", "Paytm, Amazon Pay, Mobikwik"],
                  ["COD", "Cash on delivery", "Pay the courier when it arrives"],
                ] as const
              ).map(([value, label, hint]) => {
                const disabled = value !== "COD" && !onlineEnabled;
                return (
                  <label
                    key={value}
                    className={`flex gap-3 rounded-lg border p-3 transition ${
                      disabled
                        ? "cursor-not-allowed border-line opacity-45"
                        : method === value
                          ? "cursor-pointer border-brand-600 bg-brand-50"
                          : "cursor-pointer border-line hover:border-brand-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="method"
                      value={value}
                      disabled={disabled}
                      checked={method === value}
                      onChange={() => setMethod(value)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-brand-700"
                    />
                    <span className="text-sm">
                      <span className="block font-semibold text-ink">{label}</span>
                      <span className="block text-xs text-muted">
                        {disabled ? "Needs payment keys on the server" : hint}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>

            <button
              type="button"
              disabled={busy || !addressId}
              onClick={payNow}
              className="mt-5 w-full rounded-full bg-marigold-400 px-6 py-3 text-sm font-semibold text-brand-900 transition hover:bg-marigold-300 disabled:opacity-50"
            >
              {busy
                ? "Placing your order…"
                : method === "COD"
                  ? `Place order · ${formatPaise(cart.totals.totalP)}`
                  : `Pay ${formatPaise(cart.totals.totalP)}`}
            </button>
            <p className="mt-2 text-center text-xs text-muted">
              Stock is reserved the moment your order is placed.
            </p>
          </section>
        ) : null}
      </div>

      {/* ------------------------------------------------------- totals */}
      <aside className="rounded-card border border-line bg-paper p-5 lg:sticky lg:top-[88px]">
        <h2 className="font-display text-base font-semibold text-ink">Price details</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label={`Subtotal (${cart.itemCount} items)`}>{formatPaise(cart.totals.subtotalP)}</Row>
          {cart.totals.discountP > 0 ? (
            <Row label={`Coupon ${cart.coupon?.code ?? ""}`} good>
              −{formatPaise(cart.totals.discountP)}
            </Row>
          ) : null}
          <Row label="Delivery">
            {cart.totals.shippingP === 0 ? (
              <span className="font-semibold text-success">FREE</span>
            ) : (
              formatPaise(cart.totals.shippingP)
            )}
          </Row>
        </dl>
        <div className="mt-3 flex items-baseline justify-between border-t border-line-strong pt-3">
          <span className="text-sm font-semibold text-ink">Total</span>
          <span className="font-display text-xl font-semibold tabular-nums">
            {formatPaise(cart.totals.totalP)}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">Inclusive of all taxes</p>
      </aside>
    </div>
  );
}

function Row({ label, children, good }: { label: string; children: React.ReactNode; good?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={`tabular-nums ${good ? "font-semibold text-success" : "text-ink"}`}>{children}</dd>
    </div>
  );
}

function Field({
  label,
  name,
  required,
  className,
  defaultValue,
  inputMode,
}: {
  label: string;
  name: string;
  required?: boolean;
  className: string;
  defaultValue?: string;
  inputMode?: "numeric";
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-semibold text-ink">
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </span>
      <input
        name={name}
        required={required}
        defaultValue={defaultValue}
        inputMode={inputMode}
        className={className}
      />
    </label>
  );
}
