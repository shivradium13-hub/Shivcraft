/**
 * Outbound message channels for order updates — email and WhatsApp.
 *
 * Both are env-gated: when the keys are absent the function is a no-op that
 * returns false, so the shop keeps working on in-app notifications alone and
 * nothing fake is ever sent. Each provider is isolated in one function so a
 * different provider (a different SMTP/email service, or Interakt/Gupshup/MSG91
 * for WhatsApp instead of Meta) is a small, local swap.
 *
 * NOTE: no live send has been made from here. Confirm the provider's exact
 * request shape with a test message before relying on it.
 */

/* ------------------------------------------------------------------- email */

/** Email via Resend's HTTP API (RESEND_API_KEY + EMAIL_FROM). */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from || !to) return false;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      console.error("[notify] email failed:", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (error) {
    console.error("[notify] email error:", error);
    return false;
  }
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/* ---------------------------------------------------------------- whatsapp */

/**
 * WhatsApp via Meta's Cloud API (WHATSAPP_TOKEN + WHATSAPP_PHONE_ID). Business-
 * initiated messages MUST use a pre-approved template, so this sends a template
 * by name with ordered body parameters — the template is created and approved
 * by the shop in its WhatsApp provider, and its name is passed in per event.
 */
export async function sendWhatsAppTemplate(
  toPhone: string,
  templateName: string,
  bodyParams: string[],
): Promise<boolean> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId || !toPhone || !templateName) return false;

  // India numbers stored as 10 digits; WhatsApp wants the country code.
  const digits = toPhone.replace(/\D/g, "");
  const to = digits.length === 10 ? `91${digits}` : digits;

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "en" },
          components: bodyParams.length
            ? [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }]
            : [],
        },
      }),
    });
    if (!res.ok) {
      console.error("[notify] whatsapp failed:", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (error) {
    console.error("[notify] whatsapp error:", error);
    return false;
  }
}

export function whatsappConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
}
