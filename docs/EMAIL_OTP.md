# Dual-channel login OTP — WhatsApp + Email (Brevo)

The login OTP can be delivered over **two channels at once**: WhatsApp (existing,
unchanged) and **email via Brevo** (new). One secure code is generated per login
request and sent **concurrently** to both — WhatsApp always, and email **only**
when the account has a **verified** email and the email channel is switched on.

Built **mock-first**: until the Brevo key, sender domain and account sending
permissions are verified, every email "send" is a mock (logged with the
recipient masked, the code never logged) and **no real email leaves the system**.
Real sending cannot turn itself on.

---

## How it fits the existing OTP

- One code per request: `issueOtp()` generates a single OTP, stores its hash, and
  dispatches that **same** code to WhatsApp and (when eligible) email with
  `Promise.all`.
- **WhatsApp is unchanged.** A customer with no verified email gets exactly the
  old WhatsApp-only flow. In production, the WhatsApp result still decides
  success while email is mock-first.
- Once email is live, a delivery on **either** channel keeps the code usable, so
  email also acts as a fallback if WhatsApp fails.
- "Verified email" = `users.emailVerifiedAt` is set **and** the address is a real
  (non-synthetic) inbox. OTP-only WhatsApp accounts (synthetic
  `…@phone.shivradium.local` emails) never receive an email code.

Registration does **not** mark an email verified — ownership must be proven
first (see below), so the email channel only reaches addresses the customer has
confirmed. Until a customer verifies, they keep the WhatsApp-only flow unchanged.

---

## Email verification (proving ownership)

Before a customer can receive login codes by email, they verify the address from
**My Account → Email verification**:

1. They click **Send verification link** → `POST /api/auth/email/request` sends a
   confirmation email (mock-first) with a signed link to `/verify-email?token=…`.
2. Opening the link shows a **Verify my email** button (a click → `POST
   /api/auth/email/confirm`, *not* an automatic GET — so email link scanners
   can't silently verify an address).
3. On success, `users.emailVerifiedAt` is set and email OTP can reach them.

The token is **stateless** — an HMAC-SHA256-signed, 60-minute payload
`{userId, email, exp}` — so there is **no database table and no migration**. A
token only verifies when the account's *current* email still matches, and
synthetic placeholder addresses are rejected. The signing secret is
`EMAIL_VERIFY_SECRET` (falls back to `OTP_PEPPER` / `WHATSAPP_APP_SECRET`).

Verification emails are gated by the master `enabled` switch + live mode, so in
mock/dev nothing is delivered and the link is echoed to the account page for
testing.

---

## Modes

| Mode | When | Behaviour |
|------|------|-----------|
| **mock** (default) | email integration off, OR no `BREVO_API_KEY`, OR no sender, OR `EMAIL_LIVE` ≠ `true` | Every email send is logged (recipient masked, code never logged) and reported as a mock success. No Brevo call. |
| **live** | email `enabled` **and** `otpEnabled` (settings) **and** `BREVO_API_KEY` present **and** a sender configured **and** `EMAIL_LIVE=true` | Real Brevo API calls. |

All five conditions are required before a single real email can be sent.

---

## Environment variables (server only — never in the DB, client or logs)

| Variable | Required for live email | Notes |
|----------|-------------------------|-------|
| `BREVO_API_KEY` | yes | Brevo API v3 key (Transactional Email). Secret — server env only, never `NEXT_PUBLIC_`. |
| `EMAIL_LIVE` | to actually send | `true` enables live delivery. Anything else = mock. |
| `BREVO_FROM_EMAIL` | sender (env option) | A **verified** Brevo sender, e.g. `no-reply@shivradium.com`. Used when the admin sender field is blank. |
| `BREVO_FROM_NAME` | optional | From name; default "Shiv Radium". |
| `EMAIL_VERIFY_SECRET` | optional | HMAC secret for verification links; falls back to `OTP_PEPPER` / `WHATSAPP_APP_SECRET`. |

The sender can be set **either** by env (`BREVO_FROM_EMAIL`/`BREVO_FROM_NAME`)
**or** in **Admin → Email** (settings win when set). Toggles + subject live in the
`settings` table under key `email` (normalised by `src/lib/email.ts`):

| Setting | Meaning |
|---------|---------|
| `enabled` | master switch for the email integration (default off) |
| `otpEnabled` | send the login OTP by email (default off) |
| `senderEmail` | overrides `BREVO_FROM_EMAIL`; must be a **verified** Brevo sender |
| `senderName` | overrides `BREVO_FROM_NAME` |
| `otpSubject` | subject line |

**Brevo client resilience:** the send has a 10s timeout, classifies failures
(auth / sender / rate-limited / transient), and retries **once** on a transient
error (timeout / network / 5xx) only — never on 401/403/429 or an unverified-sender
400, so it won't hammer a limit or risk a duplicate (a retry re-sends the *same*
code). An email failure never invalidates the WhatsApp OTP. (`pnpm test:email-brevo`.)

---

## Status & what's left to go live

Done (owner): `BREVO_API_KEY` set in Vercel Production; `shivradium.com`
authenticated in Brevo (Brevo code + DKIM1 + DKIM2 + DMARC); API key restricted
to Transactional Email.

**BLOCKER — sender not ready:** the professional sender `no-reply@shivradium.com`
is **not yet a verified/approved Brevo sender**. `shivradium13@gmail.com` is a
verified sender but Brevo warns on the free Gmail domain — do **not** use it for
production login codes. Until a proper sender on `shivradium.com` is approved,
the integration ships with email **disabled** (mock).

To go live, once `no-reply@shivradium.com` is a verified Brevo sender:
1. Set `BREVO_FROM_EMAIL=no-reply@shivradium.com` (and `BREVO_FROM_NAME=Shiv Radium`)
   in Vercel Production — or set the sender in **Admin → Email**.
2. Set `EMAIL_LIVE=true` in Vercel Production and redeploy.
3. In **Admin → Email**: turn on **Enable email integration**, then (after a test)
   **Enable Email OTP**.
4. Have a customer verify their email (My Account → Email verification), then do one
   test login and confirm the code arrives on both WhatsApp and email.

Until then everything stays in mock mode — safe, already deployed, and the
WhatsApp OTP is unaffected. Both admin toggles default **off**.

---

## Endpoints / files

- `POST /api/auth/otp/send` · `/resend` — unchanged routes; they call `issueOtp`,
  which now fans out to both channels.
- `src/lib/email.ts` — email settings shape + normaliser, `isRealEmail`.
- `src/server/email/settings.ts` — settings store (key `email`).
- `src/server/email/service.ts` — Brevo service (mock/live, `sendOtpEmail`,
  `isEmailLiveMode`, `emailStatus`, `maskEmail`).
- `src/server/auth/otp.ts` — `issueOtp` dual-channel dispatch + verified-email lookup.
- `src/server/auth/emailVerify.ts` — stateless signed verify tokens + `markEmailVerifiedFromToken`.
- `POST /api/auth/email/request` · `POST /api/auth/email/confirm` — verification endpoints.
- `src/app/verify-email/page.tsx` + `VerifyEmailClient` — the confirmation page.
- `src/components/shop/EmailVerifyCard.tsx` — the My Account verification card.
- Admin: `src/app/admin/email/page.tsx`, `EmailSettingsForm`, `GET`/`PUT /api/admin/email`
  — the **Enable Email OTP** toggle + sender settings + connection status.
- Tests: `scripts/test-email-otp.ts` (`pnpm test:email`),
  `scripts/test-email-verify.ts` (`pnpm test:email-verify`).

Still env-only (owner sets, never in code): `BREVO_API_KEY`, `EMAIL_LIVE`,
optionally `EMAIL_VERIFY_SECRET`.
