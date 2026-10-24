import type { Metadata } from "next";

import { DailyReportTestButton } from "@/components/admin/DailyReportTestButton";
import { WhatsappSettingsForm } from "@/components/admin/WhatsappSettingsForm";
import { formatPaise } from "@/lib/money";
import { requireAdmin } from "@/server/auth/guards";
import { costSummary, failedCount, recentMessages } from "@/server/whatsapp/admin";
import { getWhatsappSettings } from "@/server/whatsapp/settings";
import { whatsappStatus } from "@/server/whatsapp/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "WhatsApp", robots: { index: false, follow: false } };

function Dot({ on }: { on: boolean }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${on ? "bg-success" : "bg-sr-line-strong"}`} />;
}

const STATUS_TONE: Record<string, string> = {
  mock: "bg-sr-100 text-sr-body",
  queued: "bg-sr-100 text-sr-body",
  sent: "bg-brand-50 text-brand-700",
  delivered: "bg-success-soft text-success",
  read: "bg-success-soft text-success",
  failed: "bg-danger-soft text-danger",
};

export default async function AdminWhatsappPage() {
  await requireAdmin();
  const settings = await getWhatsappSettings();
  const status = whatsappStatus(settings.enabled);
  const [logs, cost, failed] = await Promise.all([recentMessages(50), costSummary(), failedCount()]);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-sr-ink">WhatsApp integration</h1>
        <p className="mt-1 max-w-prose text-sm text-sr-muted">
          Official Meta Cloud API. While the business is unverified / the sender restricted, everything runs in test
          (mock) mode — the full flow works and is logged, but no real message is delivered.
        </p>
      </div>

      {/* ---------------------------------------------- connection status */}
      <section className="rounded-2xl border border-sr-line bg-sr-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold text-sr-ink">Connection</h2>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              status.mode === "live" ? "bg-success-soft text-success" : "bg-sr-100 text-sr-body"
            }`}
          >
            {status.mode === "live" ? "LIVE" : "TEST / MOCK"}
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-sr-muted">Integration enabled</dt>
            <dd className="flex items-center gap-1.5 font-medium text-sr-ink"><Dot on={status.enabled} /> {status.enabled ? "Yes" : "No"}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-sr-muted">Server credentials</dt>
            <dd className="flex items-center gap-1.5 font-medium text-sr-ink"><Dot on={status.configured} /> {status.configured ? "Present" : "Missing"}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-sr-muted">Phone Number ID</dt>
            <dd className="font-medium text-sr-ink">{status.phoneNumberIdMasked ?? "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-sr-muted">Business Account ID</dt>
            <dd className="font-medium text-sr-ink">{status.businessAccountId ?? "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-sr-muted">Graph version</dt>
            <dd className="font-medium text-sr-ink">{status.graphVersion}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-sr-muted">App secret (webhook sig)</dt>
            <dd className="flex items-center gap-1.5 font-medium text-sr-ink"><Dot on={status.hasAppSecret} /> {status.hasAppSecret ? "Set" : "Not set"}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-sr-muted">Webhook verify token</dt>
            <dd className="flex items-center gap-1.5 font-medium text-sr-ink"><Dot on={status.webhookConfigured} /> {status.webhookConfigured ? "Set" : "Not set"}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-sr-muted">Live flag (WHATSAPP_LIVE)</dt>
            <dd className="flex items-center gap-1.5 font-medium text-sr-ink"><Dot on={status.liveFlag} /> {status.liveFlag ? "On" : "Off"}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-sr-muted">
          The access token, app secret and verify token are read only from server environment variables — they are
          never shown here or sent to the browser.
        </p>
      </section>

      {/* ------------------------------------------------- cost dashboard */}
      <section className="rounded-2xl border border-sr-line bg-sr-surface p-5">
        <h2 className="font-display text-base font-semibold text-sr-ink">Usage — {cost.monthLabel}</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "OTP (auth)", value: cost.authCount },
            { label: "Order (utility)", value: cost.utilityCount },
            { label: "Mock (not sent)", value: cost.mockCount },
            { label: "Est. cost", value: formatPaise(cost.estimatedPaise) },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-sr-line bg-sr-canvas p-3">
              <div className="text-lg font-bold text-sr-ink">{c.value}</div>
              <div className="text-xs text-sr-muted">{c.label}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-sr-muted">
          Billable messages only (real sends). Estimate uses your configured rates — for reporting, nothing is charged
          here.{failed > 0 ? ` ${failed} message(s) have failed.` : ""}
        </p>
      </section>

      {/* ---------------------------------------------- daily report test */}
      <section className="rounded-2xl border border-sr-line bg-sr-surface p-5">
        <h2 className="font-display text-base font-semibold text-sr-ink">Daily orders report</h2>
        <p className="mt-0.5 mb-3 text-xs text-sr-muted">
          Sends the day&rsquo;s orders (summary + PDF) to the report WhatsApp number now, so you can
          test it without waiting for the 9 PM schedule.
        </p>
        <DailyReportTestButton />
      </section>

      {/* -------------------------------------------------------- settings */}
      <WhatsappSettingsForm initial={settings} />

      {/* ----------------------------------------------------- message log */}
      <section className="rounded-2xl border border-sr-line bg-sr-surface p-5">
        <h2 className="font-display text-base font-semibold text-sr-ink">Message log</h2>
        {logs.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-sr-line-strong px-4 py-6 text-center text-sm text-sr-muted">
            No messages yet.
          </p>
        ) : (
          <div className="mt-3 -mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-[11px] font-semibold uppercase tracking-wide text-sr-muted">
                <tr className="border-b border-sr-line">
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">To</th>
                  <th className="py-2 pr-3">Order</th>
                  <th className="py-2 pr-3">Template</th>
                  <th className="py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((m) => (
                  <tr key={m.id} className="border-b border-sr-line/60">
                    <td className="py-2 pr-3 whitespace-nowrap text-sr-muted">{m.createdAt.toLocaleString("en-IN")}</td>
                    <td className="py-2 pr-3">{m.kind === "otp" ? "OTP" : "Order"}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{m.toPhoneMasked}</td>
                    <td className="py-2 pr-3">{m.orderNumber ?? "—"}</td>
                    <td className="py-2 pr-3">{m.template ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[m.status] ?? "bg-sr-100 text-sr-body"}`}>
                        {m.status}
                      </span>
                      {m.error ? <span className="ml-1 text-xs text-danger" title={m.error}>⚠</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
