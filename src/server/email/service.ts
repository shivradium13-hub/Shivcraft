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
  /** Fallback sender from env (BREVO_FROM_EMAIL/BREVO_FROM_NAME). */
  fromEmail: string | null;
  fromName: string | null;
};

export function getEmailEnv(): EmailEnv {
  return {
    apiKey: process.env.BREVO_API_KEY || null,
    liveFlag: process.env.EMAIL_LIVE === "true",
    fromEmail: process.env.BREVO_FROM_EMAIL || null,
    fromName: process.env.BREVO_FROM_NAME || null,
  };
}

/**
 * The sender to send as. Admin settings win when set, else the env fallback
 * (BREVO_FROM_EMAIL/BREVO_FROM_NAME), else a safe name default. Email is only
 * sent at all when `email` returns non-empty (see isEmailLiveMode), so an
 * unconfigured sender keeps everything in mock mode.
 */
export function resolveSender(settings: EmailSettings, env = getEmailEnv()): { email: string; name: string } {
  return {
    email: (settings.senderEmail || env.fromEmail || "").trim(),
    name: (settings.senderName || env.fromName || "Shiv Radium").trim(),
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
  return enabled && emailCredentialsPresent(env) && Boolean(senderEmail.trim()) && env.liveFlag;
}

/** For display in the admin / status reports — no secret material. */
export function emailStatus(settings: EmailSettings) {
  const env = getEmailEnv();
  const configured = emailCredentialsPresent(env);
  const sender = resolveSender(settings, env);
  const live = isEmailLiveMode(settings.enabled, sender.email, env);
  return {
    enabled: settings.enabled,
    otpEnabled: settings.otpEnabled,
    configured,
    live,
    mode: live ? ("live" as const) : ("mock" as const),
    hasApiKey: configured,
    senderEmail: sender.email || null,
    senderName: sender.name,
    /** Where the sender came from, so the admin can tell env vs settings. */
    senderSource: settings.senderEmail ? ("settings" as const) : env.fromEmail ? ("env" as const) : ("unset" as const),
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

const BREVO_TIMEOUT_MS = 10_000;

/** A coarse classification of a Brevo failure, for logs and retry decisions. */
type EmailErrorClass = "auth" | "sender" | "rate_limited" | "transient" | "client" | "unknown";

function classify(status: number, code?: string): EmailErrorClass {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "transient";
  // Brevo flags an unauthorised/unverified sender on a 400 with these codes.
  if (status === 400 && (code === "invalid_parameter" || /sender/i.test(code ?? ""))) return "sender";
  if (status >= 400) return "client";
  return "unknown";
}

/**
 * Low-level Brevo transactional send — ONE attempt. Returns ok, a server-only
 * error string, the error class, and whether a retry is worth trying. The API
 * key, the OTP code and the full request body are NEVER logged.
 */
async function postBrevoEmailOnce(
  apiKey: string,
  args: { to: string; senderEmail: string; senderName: string; subject: string; html: string; text: string },
): Promise<{ ok: boolean; error?: string; errorClass?: EmailErrorClass; retryable: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BREVO_TIMEOUT_MS);
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
      signal: controller.signal,
    });
    if (!res.ok) {
      // Only the provider's short message/code is read — never echoed to the client.
      const body = (await res.json().catch(() => ({}))) as { message?: string; code?: string };
      const errorClass = classify(res.status, body?.code);
      console.error(`[email] Brevo send failed (${errorClass}):`, res.status, body?.code ?? "");
      return { ok: false, error: `${errorClass}:${res.status}`, errorClass, retryable: errorClass === "transient" };
    }
    return { ok: true, retryable: false };
  } catch (error) {
    // Abort (timeout) or a network error: the request may not have reached Brevo.
    const timedOut = error instanceof Error && error.name === "AbortError";
    console.error("[email] Brevo send error:", timedOut ? "timeout" : "network");
    return { ok: false, error: timedOut ? "timeout" : "network", errorClass: "transient", retryable: true };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send one email with a single retry on a clearly-transient failure (timeout /
 * network / 5xx). We deliberately do NOT retry 429 or 4xx: a retry there would
 * either hammer a rate limit or risk a duplicate delivery, and the customer
 * still has the WhatsApp code. A retry re-sends the SAME OTP, so at worst a
 * transient blip produces one duplicate of an identical code — never a second,
 * different code.
 */
async function postBrevoEmail(
  apiKey: string,
  args: { to: string; senderEmail: string; senderName: string; subject: string; html: string; text: string },
): Promise<{ ok: boolean; error?: string }> {
  const first = await postBrevoEmailOnce(apiKey, args);
  if (first.ok || !first.retryable) return first;
  await new Promise((r) => setTimeout(r, 400));
  const second = await postBrevoEmailOnce(apiKey, args);
  return second;
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
  const sender = resolveSender(args.settings, env);
  const live = isEmailLiveMode(args.settings.enabled, sender.email, env);

  if (!live) {
    // Mock: log the attempt without the code or any secret.
    console.info(`[email] mock OTP email to ${maskEmail(args.to)} (not sent)`);
    return { ok: true, mock: true };
  }

  const { text, html } = otpEmailBody(args.code, args.ttlMinutes, sender.name);
  const result = await postBrevoEmail(env.apiKey as string, {
    to: args.to,
    senderEmail: sender.email,
    senderName: sender.name,
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
  const sender = resolveSender(args.settings, env);
  const live = isEmailLiveMode(args.settings.enabled, sender.email, env);

  if (!live) {
    console.info(`[email] mock verification email to ${maskEmail(args.to)} (not sent)`);
    return { ok: true, mock: true };
  }

  const { text, html } = verificationEmailBody(args.link, sender.name, args.ttlMinutes);
  const result = await postBrevoEmail(env.apiKey as string, {
    to: args.to,
    senderEmail: sender.email,
    senderName: sender.name,
    subject: `Verify your email · ${sender.name}`,
    html,
    text,
  });
  return { ok: result.ok, mock: false, error: result.error };
}
