# WhatsApp OTP & Order Notifications

Official **Meta WhatsApp Cloud API** integration for Shiv Radium — customer
login by one-time password, and automated order-status messages. Built
**mock-first**: while the business is unverified / the sender restricted, the
whole system works and is logged, but **no real message is delivered** and real
delivery cannot turn itself on.

---

## Modes

| Mode | When | Behaviour |
|------|------|-----------|
| **mock** (default) | integration off, OR no credentials, OR `WHATSAPP_LIVE` ≠ `true` | Every send is recorded in the log with status `mock`. OTP still works end-to-end; in dev the code is echoed to the browser so the flow is testable. |
| **live** | integration enabled (admin) **and** credentials present **and** `WHATSAPP_LIVE=true` | Real Meta Cloud API calls. |

The admin **master switch** (WhatsApp → Integration → Enable) and the
**WHATSAPP_LIVE** env flag are two independent locks — both are required before
a real message can go out.

---

## Environment variables (server only — Vercel → Settings → Environment Variables)

| Variable | Required for live | Notes |
|----------|-------------------|-------|
| `WHATSAPP_ACCESS_TOKEN` | yes | Cloud API access token (System User token recommended). *Fallback: `WHATSAPP_TOKEN`.* |
| `WHATSAPP_PHONE_NUMBER_ID` | yes | The sender's Phone Number ID. *Fallback: `WHATSAPP_PHONE_ID`.* |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | recommended | WABA id (shown in the admin status). |
| `WHATSAPP_GRAPH_VERSION` | optional | Defaults to `v21.0`. |
| `WHATSAPP_APP_SECRET` | for webhook | Used to verify `x-hub-signature-256` on incoming webhooks. |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | for webhook | Any random string; must match what you enter in Meta's webhook setup. |
| `WHATSAPP_LIVE` | to send real messages | `true` enables live delivery. Anything else = mock. |
| `OTP_PEPPER` | optional | Extra secret mixed into OTP hashing. Falls back to `WHATSAPP_APP_SECRET`. |

> Secrets are read **only** from these env vars — never stored in the database,
> returned by an API, shown in the admin, or logged.

Template **names** and language are set in the admin (WhatsApp → Templates), not
in env.

---

## Meta production activation — step by step

1. **Finish Business Verification** in Meta Business Manager (currently in
   review). The sender must be **unrestricted** before real messages send.
2. **Add / verify the sender number** in WhatsApp Manager and note its
   **Phone Number ID** and the **WhatsApp Business Account ID**.
3. **Create & get approval for message templates** in WhatsApp Manager:
   - One **Authentication** template with a **Copy-code button** (for OTP).
   - Up to four **Utility** templates (order confirmed / shipped / out for
     delivery / delivered), each with a body that takes two text variables:
     `{{1}}` = order number, `{{2}}` = the status line.
4. **Create a System User access token** (Business Settings → Users → System
   Users) with `whatsapp_business_messaging` + `whatsapp_business_management`,
   scoped to the WABA. Use this as `WHATSAPP_ACCESS_TOKEN`.
5. **Set the env vars** above in Vercel (Production). Redeploy.
6. **Configure the webhook** (Meta App → WhatsApp → Configuration):
   - Callback URL: `https://www.shivradium.com/api/whatsapp/webhook`
   - Verify token: the value of `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
   - Subscribe to the **messages** field (delivery statuses).
7. In the **admin → WhatsApp** page: enter the approved **template names** +
   language, turn on **Enable WhatsApp integration**, and the toggles you want
   (OTP login, each order notification). Confirm the Connection card shows
   credentials **Present** and the IDs are right.
8. **Go live:** set `WHATSAPP_LIVE=true` in Vercel and redeploy. Send **one**
   test OTP and **one** test order message, confirm they arrive and the message
   log shows `sent` → `delivered`. Only then rely on it.

Until step 8, everything stays in mock mode — safe to configure and test now.

---

## Endpoints

- `POST /api/auth/otp/send` · `POST /api/auth/otp/verify` · `POST /api/auth/otp/resend`
  — customer OTP login (rate-limited, no account enumeration, single-use codes).
- `GET /api/whatsapp/webhook` — Meta subscription challenge.
- `POST /api/whatsapp/webhook` — delivery-status callbacks (HMAC-verified, idempotent).
- `GET`/`PUT /api/admin/whatsapp` — admin settings (requireAdmin).

## Changed / new files

- DB: migration `0018` — `otp_codes`, `whatsapp_messages`.
- `src/lib/whatsapp.ts` — settings shape + normaliser, phone helpers.
- `src/server/whatsapp/{service,settings,admin}.ts` — Cloud API service (mock/live,
  logging, OTP + order sends, webhook signature + status updates), settings store,
  admin queries (logs, cost).
- `src/server/auth/otp.ts` — OTP generate/verify, find-or-create user by phone.
- `src/app/api/auth/otp/{send,verify,resend}/route.ts` — OTP endpoints.
- `src/app/api/whatsapp/webhook/route.ts` — webhook.
- `src/app/api/admin/whatsapp/route.ts` — admin settings API.
- `src/components/auth/{OtpLoginForm,LoginTabs}.tsx`, `src/app/login/page.tsx` — login UI.
- `src/app/admin/whatsapp/page.tsx`, `src/components/admin/WhatsappSettingsForm.tsx`,
  `src/app/admin/layout.tsx` — admin page + nav.
- `src/server/notify/orderNotify.ts` + the three status/webhook callers +
  `src/app/api/checkout/verify/route.ts` — order notifications routed through the
  gated, deduped, logged WhatsApp path (confirmation only after verified payment).
