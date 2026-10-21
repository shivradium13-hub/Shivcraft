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

> ⚠️ **No account currently has a verified email** — the app has no
> email-verification step yet, and registration does not set `emailVerifiedAt`.
> So until a verification mechanism exists (or you decide registered emails
> should count as verified), the email channel stays dormant and WhatsApp OTP is
> 100% unaffected. This is intentional and safe.

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
| `BREVO_API_KEY` | yes | Brevo API v3 key. Secret — server env only. |
| `EMAIL_LIVE` | to actually send | `true` enables live delivery. Anything else = mock. |

The sender identity and toggles are **non-secret** and live in the `settings`
table under key `email` (normalised by `src/lib/email.ts`):

| Setting | Meaning |
|---------|---------|
| `enabled` | master switch for the email integration (default off) |
| `otpEnabled` | send the login OTP by email (default off) |
| `senderEmail` | a **verified** sender address on a **verified domain** in Brevo |
| `senderName` | From name (default "Shiv Radium") |
| `otpSubject` | subject line |

---

## What I need from you to go live (Brevo config)

1. **`BREVO_API_KEY`** — in Brevo: *SMTP & API → API Keys → Generate*. Add it to
   Vercel (Production) as `BREVO_API_KEY`. (You set it; I never see the value.)
2. **Verified sender + domain** — add and verify your sender domain in Brevo
   (*Senders, Domains & Dedicated IPs*), complete the DKIM/SPF DNS records, and
   confirm a sender address on that domain. Tell me the sender address to use
   (e.g. `no-reply@shivradium.com`).
3. **Account sending permission** — confirm the Brevo account is activated for
   transactional sending (new/free accounts can be review-gated at first).
4. Decide **what counts as a verified email** (there's no verification step yet):
   add an email-verification flow, or treat registered emails as verified — your
   call. Until then the email channel stays dormant.
5. When all the above are ready: set `EMAIL_LIVE=true` in Vercel, turn on the
   `email` settings (`enabled` + `otpEnabled` + `senderEmail`), and send one test
   login to confirm the email arrives alongside the WhatsApp code.

Until step 5, everything stays in mock mode — safe to wire up and test now.

---

## Endpoints / files

- `POST /api/auth/otp/send` · `/resend` — unchanged routes; they call `issueOtp`,
  which now fans out to both channels.
- `src/lib/email.ts` — email settings shape + normaliser, `isRealEmail`.
- `src/server/email/settings.ts` — settings store (key `email`).
- `src/server/email/service.ts` — Brevo service (mock/live, `sendOtpEmail`,
  `isEmailLiveMode`, `emailStatus`, `maskEmail`).
- `src/server/auth/otp.ts` — `issueOtp` dual-channel dispatch + verified-email lookup.
- `scripts/test-email-otp.ts` — mock tests (`pnpm test:email`).

Not included (safe follow-ups): an admin toggle UI for the email channel, and the
email-verification flow that sets `emailVerifiedAt`.
