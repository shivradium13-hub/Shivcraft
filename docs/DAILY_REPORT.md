# Daily orders digest (owner)

Every evening the owner gets an automatic summary of the day's orders. Two
channels, each independent and optional (configured in the `reports` settings):

- **WhatsApp** — a short summary (counts + amount) via an approved template.
- **Email** — the full per-order report (table of every order).

## How it runs

- **Schedule:** a Vercel Cron (`vercel.json`) hits `GET /api/cron/daily-orders`
  once a day at **15:30 UTC = 9:00 PM IST**. (Change the time in `vercel.json`.)
- **The day** is a calendar day in **IST** (`src/server/reports/dailyOrders.ts`).
- The cron sends WhatsApp if a template + number are set, and email if an email
  recipient is set. Nothing configured for a channel = that channel is skipped.

## WhatsApp — the template the owner must create (Meta approval)

A business-initiated WhatsApp message needs a **pre-approved template**, so the
owner creates this once in **Meta WhatsApp Manager → Message templates**:

- **Name:** `daily_orders_report` (lowercase + underscores only)
- **Category:** Utility
- **Language:** English
- **Body** (5 variables, text around each, nothing at the very end is a bare
  variable):

  ```
  Shiv Radium — daily orders summary for {{1}}.
  Total orders: {{2}}. Amount collected: {{3}}.
  Awaiting payment: {{4}}. Cancelled: {{5}} order(s).
  ```

- **Sample values** (Meta asks for these): {{1}} `22 October 2026`, {{2}} `5`,
  {{3}} `₹4,500`, {{4}} `1`, {{5}} `0`.

The code sends those 5 variables in that exact order (date, count, collected,
awaiting-payment, cancelled), so the template body must keep that order. Once
approved, give me the **template name** and the **WhatsApp number** to send to.

## To turn it on

1. **WhatsApp:** after the template is approved, set `reports.whatsappTemplate`
   (the approved name) and `reports.whatsappTo` (owner's number). WhatsApp is
   already live in production.
2. **Email (optional):** set `reports.emailTo` to receive the full report too.
   Email is already live (`EMAIL_LIVE=true`, sender `no-reply@shivradium.com`).
3. **`CRON_SECRET`** in Vercel → Settings → Environment Variables (Production):
   any long random string. Vercel sends it as a Bearer token on the scheduled
   request; the endpoint rejects anything without it. Redeploy after setting it.

## Test / verify

- `pnpm test:daily-report` — IST day boundaries, aggregation, mock WhatsApp +
  mock email (no real send), settings normalise.
- After deploy, trigger manually:
  `curl -H "Authorization: Bearer <CRON_SECRET>" https://www.shivradium.com/api/cron/daily-orders`

## Files

- `src/server/reports/dailyOrders.ts` — `istDayRange`, `buildDailyOrdersReport`.
- `src/server/reports/settings.ts` — the `reports` channel config.
- `src/server/whatsapp/service.ts` — `sendReportTemplate` (WhatsApp summary).
- `src/server/email/service.ts` — `sendAdminEmail` (full email report).
- `src/app/api/cron/daily-orders/route.ts` — the cron endpoint (CRON_SECRET-gated).
- `vercel.json` — the cron schedule.
