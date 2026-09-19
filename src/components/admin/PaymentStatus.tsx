import type { RazorpayStatus } from "@/server/payments/razorpay";

/**
 * Shows whether online payment is wired up, and where to wire it.
 *
 * A server component on purpose, and it receives a status object rather than
 * any key material: the secret signs and verifies payments, so nothing that
 * renders ever reads it. There is no form here either — keys belong in the
 * host's environment, not in a database row that every future admin can read.
 */
export function PaymentStatus({ status }: { status: RazorpayStatus }) {
  const half = !status.configured && (status.hasKeyId || status.hasKeySecret);

  return (
    <section className="rounded-card border border-sr-line bg-sr-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-sr-ink">Online payment</h2>
        {status.configured ? (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              status.mode === "live"
                ? "bg-success-soft text-success"
                : "bg-sr-gold-soft text-sr-gold"
            }`}
          >
            {status.mode === "live" ? "Live keys" : "Test keys"}
          </span>
        ) : (
          <span className="rounded-full bg-sr-canvas px-2.5 py-1 text-xs font-semibold text-sr-muted">
            Not set up
          </span>
        )}
      </div>

      {status.configured ? (
        <p className="mt-2 text-sm text-sr-body">
          Razorpay is connected, so UPI, cards, net banking and wallets appear at checkout
          alongside cash on delivery.
          {status.mode === "test" ? (
            <>
              {" "}
              These are <strong>test</strong> keys — real money does not move. Swap them for{" "}
              <code className="rounded bg-sr-canvas px-1 text-xs">rzp_live_…</code> keys when you
              are ready to take orders.
            </>
          ) : (
            <> These are live keys, so customers are charged for real.</>
          )}
        </p>
      ) : (
        <p className="mt-2 text-sm text-sr-body">
          {half
            ? "Only one of the two values is set, so online payment stays switched off. Both are needed."
            : "Online payment is switched off. The checkout offers cash on delivery only — the card and UPI buttons are hidden rather than shown and then failing."}
        </p>
      )}

      <dl className="mt-3 overflow-hidden rounded-lg border border-sr-line">
        <Row label="RAZORPAY_KEY_ID" present={status.hasKeyId} />
        <Row label="RAZORPAY_KEY_SECRET" present={status.hasKeySecret} />
      </dl>

      <div className="mt-3 rounded-lg bg-sr-canvas px-3 py-2.5 text-xs text-sr-muted">
        <p className="font-semibold text-sr-ink">Where these go</p>
        <p className="mt-1">
          They are read from the server environment, never typed in here and never stored in the
          database — a key that signs payments should not sit in a row an admin page can read.
        </p>
        <ol className="mt-2 list-decimal space-y-0.5 pl-4">
          <li>Razorpay Dashboard → Settings → API Keys → Generate Key.</li>
          <li>
            Vercel → this project → Settings → Environment Variables. Add both, target{" "}
            <strong>Production</strong>.
          </li>
          <li>Redeploy. The checkout picks them up on the next request.</li>
        </ol>
        <p className="mt-2">
          For local work put the same two lines in <code>.env.local</code>. Start with test keys and
          watch the first transaction in Razorpay&rsquo;s test mode — no live payment has ever been
          taken through this code.
        </p>
      </div>
    </section>
  );
}

function Row({ label, present }: { label: string; present: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-sr-line px-3 py-2 text-sm last:border-b-0">
      <code className="text-xs text-sr-body">{label}</code>
      <span
        className={`text-xs font-semibold ${present ? "text-success" : "text-sr-muted"}`}
      >
        {present ? "Set" : "Not set"}
      </span>
    </div>
  );
}
