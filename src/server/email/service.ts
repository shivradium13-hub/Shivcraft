import type { EmailSettings } from "@/lib/email";

/**
 * Transactional email via Brevo (https://api.brevo.com), used as a SECOND
 * delivery channel for the login OTP alongside WhatsApp.
 *
 * Secrets live ONLY in env (`BREVO_API_KEY`), never in the database, the client
 * or a log. Two modes, exactly like the WhatsApp service:
 *
 *   mock — nothing is delivered; the attempt is logged (recipient masked, code
 *          NEVER logged) and reported as a mock success. This is the default
 *          while the Brevo key / sender domain / account permissions are
 *          unverified, so the whole flow is testable without sending a real
 *          email.
 *   live — a real Brevo API call. Entered ONLY when the integration is enabled
 *          AND the API key is present AND a sender is configured AND the
 *          explicit `EMAIL_LIVE=true` flag is set, so sending can never turn
 *          itself on before the account is ready.
 */

export type EmailEnv = {
  apiKey: string | null;
  liveFlag: boolean;
};

export function getEmailEnv(): EmailEnv {
  return {
    apiKey: process.env.BREVO_API_KEY || null,
    liveFlag: process.env.EMAIL_LIVE === "true",
  };
}

/** Whether the server has the credentials needed to actually send. */
export function emailCredentialsPresent(env = getEmailEnv()): boolean {
  return Boolean(env.apiKey);
}

/** Live only when enabled by the owner, credentialed, sender set, and flagged. */
export function isEmailLiveMode(
  enabled: boolean,
  senderEmail: string,
  env = getEmailEnv(),
): boolean {
  return enabled && emailCredentialsPresent(env) && Boolean(senderEmail) && env.liveFlag;
}

/** For display in the admin / status reports — no secret material. */
export function emailStatus(settings: EmailSettings) {
  const env = getEmailEnv();
  const configured = emailCredentialsPresent(env);
  const live = isEmailLiveMode(settings.enabled, settings.senderEmail, env);
  return {
    enabled: settings.enabled,
    otpEnabled: settings.otpEnabled,
    configured,
    live,
    mode: live ? ("live" as const) : ("mock" as const),
    hasApiKey: configured,
    senderEmail: settings.senderEmail || null,
    senderName: settings.senderName,
    liveFlag: env.liveFlag,
  };
}

/** Mask an address for logs/reports: shivradium13@gmail.com -> sh•••@gmail.com */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "•".repeat(Math.min(email.length, 6));
  const head = local.slice(0, 2);
  return `${head}${"•".repeat(3)}@${domain}`;
}

export type EmailSendResult = { ok: boolean; mock: boolean; error?: string };

function otpEmailBody(code: string, ttlMinutes: number, brandName: string) {
  const safeCode = String(code).replace(/[^0-9]/g, "");
  const text =
    `Your ${brandName} login code is ${safeCode}. ` +
    `It expires in ${ttlMinutes} minutes. If you didn't request it, you can ignore this email. ` +
    `Never share this code with anyone.`;
  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111827">` +
    `<h1 style="font-size:18px;margin:0 0 12px">Your ${brandName} login code</h1>` +
    `<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px">Use this code to sign in. It expires in ${ttlMinutes} minutes.</p>` +
    `<p style="font-size:30px;font-weight:700;letter-spacing:6px;margin:0 0 16px;color:#111827">${safeCode}</p>` +
    `<p style="font-size:12px;line-height:1.6;color:#6b7280;margin:0">If you didn't request this, you can ignore this email. Never share this code with anyone, including people claiming to be ${brandName}.</p>` +
    `</div>`;
  return { text, html };
}

/** Low-level Brevo transactional send. Returns ok + (server-only) error text. */
async function postBrevoEmail(
  apiKey: string,
  args: { to: string; senderEmail: string; senderName: string; subject: string; html: string; text: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { email: args.senderEmail, name: args.senderName },
        to: [{ email: args.to }],
        subject: args.subject,
        htmlContent: args.html,
        textContent: args.text,
      }),
    });
    if (!res.ok) {
      // Provider wording stays in the server log, never reaches the customer.
      const body = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
      const msg = body?.message || `HTTP ${res.status}`;
      console.error("[email] Brevo send failed:", res.status, msg);
      return { ok: false, error: String(msg).slice(0, 400) };
    }
    return { ok: true };
  } catch (error) {
    console.error("[email] Brevo send error:", error);
    return { ok: false, error: "network error" };
  }
}

/**
 * Send a login OTP by email. Mock mode records the attempt (recipient masked,
 * code NEVER logged) and returns a mock success so the flow is testable; live
 * mode performs the Brevo call. The code is placed only in the email body.
 */
export async function sendOtpEmail(args: {
  to: string;
  code: string;
  settings: EmailSettings;
  ttlMinutes: number;
  userId?: string | null;
  env?: EmailEnv;
}): Promise<EmailSendResult> {
  const env = args.env ?? getEmailEnv();
  const live = isEmailLiveMode(args.settings.enabled, args.settings.senderEmail, env);

  if (!live) {
    // Mock: log the attempt without the code or any secret.
    console.info(`[email] mock OTP email to ${maskEmail(args.to)} (not sent)`);
    return { ok: true, mock: true };
  }

  const { text, html } = otpEmailBody(args.code, args.ttlMinutes, args.settings.senderName);
  const result = await postBrevoEmail(env.apiKey as string, {
    to: args.to,
    senderEmail: args.settings.senderEmail,
    senderName: args.settings.senderName,
    subject: args.settings.otpSubject,
    html,
    text,
  });
  return { ok: result.ok, mock: false, error: result.error };
}

function verificationEmailBody(link: string, brandName: string, ttlMinutes: number) {
  const text =
    `Confirm your email address for ${brandName}. ` +
    `Open this link to verify it (valid for ${ttlMinutes} minutes): ${link} . ` +
    `If you didn't request this, you can ignore this email.`;
  const html =
    `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111827">` +
    `<h1 style="font-size:18px;margin:0 0 12px">Confirm your email</h1>` +
    `<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px">Verify this email address to receive your ${brandName} login codes by email. This link is valid for ${ttlMinutes} minutes.</p>` +
    `<p style="margin:0 0 16px"><a href="${link}" style="display:inline-block;background:#e5541a;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:9999px">Verify my email</a></p>` +
    `<p style="font-size:12px;line-height:1.6;color:#6b7280;margin:0">If the button doesn't work, copy this link into your browser:<br><span style="word-break:break-all">${link}</span></p>` +
    `<p style="font-size:12px;line-height:1.6;color:#6b7280;margin:12px 0 0">If you didn't request this, you can ignore this email.</p>` +
    `</div>`;
  return { text, html };
}

/**
 * Send an email-ownership verification link. Mock mode logs the attempt
 * (recipient masked, the link — which carries a token — is NEVER logged) and
 * reports a mock success; live mode performs the Brevo call. Gated only by the
 * master `enabled` switch (not `otpEnabled`), so a customer can verify first and
 * the owner can turn on email OTP afterwards.
 */
export async function sendVerificationEmail(args: {
  to: string;
  link: string;
  settings: EmailSettings;
  ttlMinutes: number;
  env?: EmailEnv;
}): Promise<EmailSendResult> {
  const env = args.env ?? getEmailEnv();
  const live = isEmailLiveMode(args.settings.enabled, args.settings.senderEmail, env);

  if (!live) {
    console.info(`[email] mock verification email to ${maskEmail(args.to)} (not sent)`);
    return { ok: true, mock: true };
  }

  const { text, html } = verificationEmailBody(args.link, args.settings.senderName, args.ttlMinutes);
  const result = await postBrevoEmail(env.apiKey as string, {
    to: args.to,
    senderEmail: args.settings.senderEmail,
    senderName: args.settings.senderName,
    subject: `Verify your email · ${args.settings.senderName}`,
    html,
    text,
  });
  return { ok: result.ok, mock: false, error: result.error };
}
