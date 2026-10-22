import type { Metadata } from "next";

import { EmailSettingsForm } from "@/components/admin/EmailSettingsForm";
import { requireAdmin } from "@/server/auth/guards";
import { getEmailSettings } from "@/server/email/settings";
import { emailStatus } from "@/server/email/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Email", robots: { index: false, follow: false } };

function Dot({ on }: { on: boolean }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${on ? "bg-success" : "bg-sr-line-strong"}`} />;
}

export default async function AdminEmailPage() {
  await requireAdmin();
  const settings = await getEmailSettings();
  const status = emailStatus(settings);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-sr-ink">Email integration (Brevo)</h1>
        <p className="mt-1 max-w-prose text-sm text-sr-muted">
          Sends verification emails and, when enabled, the login OTP by email alongside WhatsApp. Until the Brevo key,
          a verified sender and <code>EMAIL_LIVE=true</code> are all set, everything runs in test (mock) mode — no real
          email is delivered.
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
            <dt className="text-sr-muted">Email OTP enabled</dt>
            <dd className="flex items-center gap-1.5 font-medium text-sr-ink"><Dot on={status.otpEnabled} /> {status.otpEnabled ? "Yes" : "No"}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-sr-muted">API key (BREVO_API_KEY)</dt>
            <dd className="flex items-center gap-1.5 font-medium text-sr-ink"><Dot on={status.hasApiKey} /> {status.hasApiKey ? "Present" : "Missing"}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-sr-muted">Sender address</dt>
            <dd className="font-medium text-sr-ink">{status.senderEmail ?? "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-sr-muted">Live flag (EMAIL_LIVE)</dt>
            <dd className="flex items-center gap-1.5 font-medium text-sr-ink"><Dot on={status.liveFlag} /> {status.liveFlag ? "On" : "Off"}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-sr-muted">
          The Brevo API key is read only from the server environment — it is never shown here or sent to the browser.
        </p>
      </section>

      {/* -------------------------------------------------------- settings */}
      <EmailSettingsForm initial={settings} />
    </div>
  );
}
