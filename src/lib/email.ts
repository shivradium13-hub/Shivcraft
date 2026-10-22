/**
 * Admin-configurable transactional-email (Brevo) settings, stored as one JSON
 * row in the `settings` table (key "email"). The API key is a secret and is
 * NEVER stored here — it lives only in the server env var `BREVO_API_KEY`. This
 * holds the on/off flags and the (non-secret) sender identity + subject the
 * owner controls.
 *
 * Mirrors the WhatsApp settings pattern in `src/lib/whatsapp.ts` so the two
 * channels read and normalise the same way.
 */
export type EmailSettings = {
  /** Master switch for the whole email integration. Off = nothing is ever sent. */
  enabled: boolean;
  /**
   * Send the login OTP over email (in addition to WhatsApp). Off by default:
   * the email channel is dormant until the owner turns it on AND the account
   * has a verified email.
   */
  otpEnabled: boolean;
  /** Verified sender address (must be a verified sender/domain in Brevo). */
  senderEmail: string;
  /** Friendly From name. */
  senderName: string;
  /** Subject line for the OTP email. */
  otpSubject: string;
};

export const DEFAULT_EMAIL: EmailSettings = {
  enabled: false,
  otpEnabled: false,
  senderEmail: "",
  senderName: "Shiv Radium",
  otpSubject: "Your Shiv Radium login code",
};

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}
function str(v: unknown, fallback: string, max = 120): string {
  return typeof v === "string" ? v.trim().slice(0, max) : fallback;
}

/** Always returns a complete, valid settings object (never a partial shape). */
export function normaliseEmail(value: unknown): EmailSettings {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const d = DEFAULT_EMAIL;
  return {
    enabled: bool(v.enabled, d.enabled),
    otpEnabled: bool(v.otpEnabled, d.otpEnabled),
    senderEmail: str(v.senderEmail, d.senderEmail),
    senderName: str(v.senderName, d.senderName) || d.senderName,
    otpSubject: str(v.otpSubject, d.otpSubject, 200) || d.otpSubject,
  };
}

/** The synthetic email given to OTP-only (WhatsApp) accounts; never a real inbox. */
export const SYNTHETIC_EMAIL_DOMAIN = "@phone.shivradium.local";

/** A basic sanity check: a real, non-synthetic address we could email. */
export function isRealEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  if (e.endsWith(SYNTHETIC_EMAIL_DOMAIN)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}
