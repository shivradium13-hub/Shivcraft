import type { DelhiveryStatus } from "@/server/delivery/delhivery";

/**
 * Shows whether the Delhivery courier integration is wired up, and where to wire
 * it. A server component that receives a status object only — never the token.
 * Like the payment keys, Delhivery's credentials live in the host environment,
 * not in a database row an admin page could read.
 */
export function DeliveryStatus({ status }: { status: DelhiveryStatus }) {
  return (
    <section className="rounded-card border border-sr-line bg-sr-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-sr-ink">Delivery partner (Delhivery)</h2>
        {status.configured ? (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              status.mode === "live" ? "bg-success-soft text-success" : "bg-sr-gold-soft text-sr-gold"
            }`}
          >
            {status.mode === "live" ? "Live" : "Staging"}
          </span>
        ) : (
          <span className="rounded-full bg-sr-canvas px-2.5 py-1 text-xs font-semibold text-sr-muted">
            Not set up
          </span>
        )}
      </div>

      {status.configured ? (
        <p className="mt-2 text-sm text-sr-body">
          Delhivery is connected{status.pickupName ? <> (pickup <strong>{status.pickupName}</strong>)</> : null}.
          The PIN-code check uses real serviceability, and an order can be shipped with one click —
          a tracking number is fetched and the customer sees live tracking.
          {status.mode === "staging" ? (
            <> You are on <strong>staging</strong>, so no real parcel is created.</>
          ) : null}
        </p>
      ) : (
        <p className="mt-2 text-sm text-sr-body">
          Delhivery is switched off. The PIN-code check falls back to a postal-zone estimate, and
          orders are shipped manually (record the courier and tracking in the status note).
        </p>
      )}

      <dl className="mt-3 overflow-hidden rounded-lg border border-sr-line">
        <Row label="DELHIVERY_API_TOKEN" present={status.hasToken} />
        <Row label="DELHIVERY_CLIENT_NAME" present={status.hasClient} />
        <Row label="DELHIVERY_PICKUP_NAME" present={status.hasPickup} />
      </dl>

      <div className="mt-3 rounded-lg bg-sr-canvas px-3 py-2.5 text-xs text-sr-muted">
        <p className="font-semibold text-sr-ink">Where these go</p>
        <ol className="mt-2 list-decimal space-y-0.5 pl-4">
          <li>Delhivery One → register a pickup location (note its exact name) and add your GST.</li>
          <li>Delhivery One → Main Menu → Settings → API Setup → “Request Live API Token”.</li>
          <li>
            Vercel → this project → Settings → Environment Variables. Add{" "}
            <code className="rounded bg-sr-surface px-1">DELHIVERY_API_TOKEN</code>,{" "}
            <code className="rounded bg-sr-surface px-1">DELHIVERY_CLIENT_NAME</code>,{" "}
            <code className="rounded bg-sr-surface px-1">DELHIVERY_PICKUP_NAME</code> (and{" "}
            <code className="rounded bg-sr-surface px-1">DELHIVERY_BASE_URL</code> =
            staging-express host while testing), target <strong>Production</strong>, then redeploy.
          </li>
        </ol>
        <p className="mt-2">
          For local work put the same lines in <code>.env.local</code>. The token is read from the
          environment, never typed here and never stored in the database.
        </p>
      </div>
    </section>
  );
}

function Row({ label, present }: { label: string; present: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-sr-line px-3 py-2 text-sm last:border-b-0">
      <code className="text-xs text-sr-body">{label}</code>
      <span className={`text-xs font-semibold ${present ? "text-success" : "text-sr-muted"}`}>
        {present ? "Set" : "Not set"}
      </span>
    </div>
  );
}
