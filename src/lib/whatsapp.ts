/**
 * Admin-configurable WhatsApp integration settings, stored as one JSON row in
 * the `settings` table (key "whatsapp"). Secrets (access token, app secret,
 * verify token) are NEVER stored here — they live only in server env vars.
 * This holds the on/off flags, timings, template names and cost rates the admin
 * controls from the dashboard.
 */
export type WhatsappSettings = {
  /** Master switch for the whole integration. Off = nothing is ever sent. */
  enabled: boolean;

  /** WhatsApp OTP login on the storefront. */
  otpEnabled: boolean;
  otpTtlMinutes: number;
  otpResendSeconds: number;
  otpMaxAttempts: number;

  /** Independent order-notification toggles. */
  notifyConfirmed: boolean;
  notifyShipped: boolean;
  notifyOutForDelivery: boolean;
  notifyDelivered: boolean;
  notifyCancelled: boolean;

  /** Approved template names + language. */
  templateOtp: string;
  templateConfirmed: string;
  templateShipped: string;
  templateOutForDelivery: string;
  templateDelivered: string;
  templateCancelled: string;
  templateLang: string;

  /** Estimated cost per message, in paise — for the reporting dashboard only. */
  rateAuthPaise: number;
  rateUtilityPaise: number;
};

export const DEFAULT_WHATSAPP: WhatsappSettings = {
  enabled: false,
  otpEnabled: false,
  otpTtlMinutes: 5,
  otpResendSeconds: 45,
  otpMaxAttempts: 5,
  notifyConfirmed: true,
  notifyShipped: true,
  notifyOutForDelivery: true,
  notifyDelivered: true,
  notifyCancelled: true,
  templateOtp: "",
  templateConfirmed: "",
  templateShipped: "",
  templateOutForDelivery: "",
  templateDelivered: "",
  templateCancelled: "",
  templateLang: "en",
  // Rough Meta India list prices; configurable, used for reporting only.
  rateAuthPaise: 11,
  rateUtilityPaise: 12,
};

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}
function int(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
function str(v: unknown, fallback: string, max = 80): string {
  return typeof v === "string" ? v.trim().slice(0, max) : fallback;
}

/** Always returns a complete, valid settings object (never a partial shape). */
export function normaliseWhatsapp(value: unknown): WhatsappSettings {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const d = DEFAULT_WHATSAPP;
  return {
    enabled: bool(v.enabled, d.enabled),
    otpEnabled: bool(v.otpEnabled, d.otpEnabled),
    otpTtlMinutes: int(v.otpTtlMinutes, d.otpTtlMinutes, 1, 30),
    otpResendSeconds: int(v.otpResendSeconds, d.otpResendSeconds, 15, 300),
    otpMaxAttempts: int(v.otpMaxAttempts, d.otpMaxAttempts, 3, 10),
    notifyConfirmed: bool(v.notifyConfirmed, d.notifyConfirmed),
    notifyShipped: bool(v.notifyShipped, d.notifyShipped),
    notifyOutForDelivery: bool(v.notifyOutForDelivery, d.notifyOutForDelivery),
    notifyDelivered: bool(v.notifyDelivered, d.notifyDelivered),
    notifyCancelled: bool(v.notifyCancelled, d.notifyCancelled),
    templateOtp: str(v.templateOtp, d.templateOtp),
    templateConfirmed: str(v.templateConfirmed, d.templateConfirmed),
    templateShipped: str(v.templateShipped, d.templateShipped),
    templateOutForDelivery: str(v.templateOutForDelivery, d.templateOutForDelivery),
    templateDelivered: str(v.templateDelivered, d.templateDelivered),
    templateCancelled: str(v.templateCancelled, d.templateCancelled),
    templateLang: str(v.templateLang, d.templateLang, 12) || d.templateLang,
    rateAuthPaise: int(v.rateAuthPaise, d.rateAuthPaise, 0, 100000),
    rateUtilityPaise: int(v.rateUtilityPaise, d.rateUtilityPaise, 0, 100000),
  };
}

/** Normalise an Indian mobile to its last 10 digits (the storage/display form). */
export function normalisePhone10(raw: string): string {
  return (raw || "").replace(/\D/g, "").slice(-10);
}

/** For display in the admin: 98765 43210 -> 98765•••10 */
export function maskPhone(phone: string): string {
  const p = normalisePhone10(phone);
  if (p.length < 6) return "•".repeat(p.length);
  return `${p.slice(0, 2)}•••••${p.slice(-3)}`;
}
