# Daily orders digest (owner email)

Every evening the owner gets an **email summary of the day's orders** — how many
were placed, how much was collected, how many are awaiting payment or cancelled,
and a table of each order. No one has to open anything; it arrives on its own.

## How it runs

- **Schedule:** a Vercel Cron (`vercel.json`) hits `GET /api/cron/daily-orders`
  once a day at **15:30 UTC = 9:00 PM IST**. (Change the time in `vercel.json`.)
- **The day** is a calendar day in **IST**, so the evening report covers the day
  just finished (`src/server/reports/dailyOrders.ts`).
- **Email** goes out through Brevo (`sendAdminEmail`) to the support email, else
  the business email, else `shivradium13@gmail.com`. It is independent of the
  customer OTP email toggle — it sends whenever `EMAIL_LIVE=true` + `BREVO_API_KEY`
  + a verified sender are present (all already set).

## To turn it on (owner)

1. In **Vercel → Settings → Environment Variables (Production)** add
   **`CRON_SECRET`** = any long random string.
   - Vercel sends this as a `Bearer` token on the scheduled request; the endpoint
     rejects anything without it, so the report URL can't be triggered by outsiders.
   - Until `CRON_SECRET` is set, the endpoint returns 401 and no report is sent.
2. Redeploy (so Vercel registers the cron from `vercel.json`).

That's it — the digest starts arriving the next evening. Email delivery is already
live (`EMAIL_LIVE=true`, sender `no-reply@shivradium.com` verified), so nothing
else is needed.

## Test / verify

- `pnpm test:daily-report` — IST day boundaries, aggregation (paid/pending/cancelled),
  yesterday excluded, and mock email (no real send).
- After deploy you can also trigger it manually to check delivery:
  `curl -H "Authorization: Bearer <CRON_SECRET>" https://www.shivradium.com/api/cron/daily-orders`

## Files

- `src/server/reports/dailyOrders.ts` — `istDayRange`, `buildDailyOrdersReport`.
- `src/server/email/service.ts` — `sendAdminEmail` (Brevo, owner-facing).
- `src/app/api/cron/daily-orders/route.ts` — the cron endpoint (CRON_SECRET-gated).
- `vercel.json` — the cron schedule.

WhatsApp wasn't used for this: a business-initiated WhatsApp message needs an
approved template with fixed variables, which doesn't fit a daily report whose
content changes every day. Email is the right channel here.
