/**
 * Tests for the Brevo client hardening: sender resolution (settings vs env),
 * request timeout handling, error classification, and the single retry on a
 * transient failure (never on auth / 429). Run with:  pnpm test:email-brevo
 *
 * Pure — no database. global.fetch is stubbed; no real Brevo call is made.
 */
process.env.BREVO_API_KEY = "test-brevo-key-DUMMY";
process.env.EMAIL_LIVE = "true";
delete process.env.BREVO_FROM_EMAIL;
delete process.env.BREVO_FROM_NAME;

import { DEFAULT_EMAIL, type EmailSettings } from "@/lib/email";
import { getEmailEnv, resolveSender, sendOtpEmail } from "@/server/email/service";

let failures = 0;
function check(name: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

const withSender: EmailSettings = { ...DEFAULT_EMAIL, enabled: true, otpEnabled: true, senderEmail: "otp@sender.test", senderName: "SR" };
const noSender: EmailSettings = { ...DEFAULT_EMAIL, enabled: true, otpEnabled: true, senderEmail: "", senderName: "" };

const realFetch = globalThis.fetch;
type Resp = { ok: boolean; status: number; json: () => Promise<unknown> };
let calls = 0;
function queue(responses: Array<Resp | "throwAbort" | "throwNet">) {
  calls = 0;
  let i = 0;
  globalThis.fetch = (async () => {
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    calls++;
    if (r === "throwAbort") throw Object.assign(new Error("aborted"), { name: "AbortError" });
    if (r === "throwNet") throw new Error("ECONNRESET");
    return r as unknown as Response;
  }) as typeof fetch;
}
const okResp: Resp = { ok: true, status: 201, json: async () => ({ messageId: "x" }) };
function errResp(status: number, code?: string): Resp {
  return { ok: false, status, json: async () => ({ message: "err", code }) };
}

async function main() {
  console.log("\nBrevo client hardening tests");

  // --- sender resolution ----------------------------------------------------
  check("sender from settings wins", resolveSender(withSender).email === "otp@sender.test");
  process.env.BREVO_FROM_EMAIL = "no-reply@shivradium.com";
  process.env.BREVO_FROM_NAME = "Shiv Radium";
  check("sender falls back to BREVO_FROM_EMAIL env", resolveSender(noSender, getEmailEnv()).email === "no-reply@shivradium.com");
  check("name falls back to BREVO_FROM_NAME env", resolveSender(noSender, getEmailEnv()).name === "Shiv Radium");
  delete process.env.BREVO_FROM_EMAIL;
  delete process.env.BREVO_FROM_NAME;
  check("no sender anywhere → empty email (stays mock)", resolveSender(noSender, getEmailEnv()).email === "");
  check("name defaults to Shiv Radium", resolveSender(noSender, getEmailEnv()).name === "Shiv Radium");

  // No configured sender → send stays mock, makes NO network call.
  queue([okResp]);
  const mockSend = await sendOtpEmail({ to: "a@b.com", code: "123456", settings: noSender, ttlMinutes: 5 });
  check("unconfigured sender → mock send, no network", mockSend.mock === true && calls === 0);

  // --- live send + retry policy --------------------------------------------
  queue([okResp]);
  const good = await sendOtpEmail({ to: "a@b.com", code: "123456", settings: withSender, ttlMinutes: 5 });
  check("live send success (1 call)", good.ok === true && good.mock === false && calls === 1);

  queue([errResp(503), okResp]);
  const retried = await sendOtpEmail({ to: "a@b.com", code: "123456", settings: withSender, ttlMinutes: 5 });
  check("5xx then success → retried once, ok (2 calls)", retried.ok === true && calls === 2);

  queue(["throwAbort", okResp]);
  const afterTimeout = await sendOtpEmail({ to: "a@b.com", code: "123456", settings: withSender, ttlMinutes: 5 });
  check("timeout then success → retried, ok (2 calls)", afterTimeout.ok === true && calls === 2);

  queue([errResp(401)]);
  const auth = await sendOtpEmail({ to: "a@b.com", code: "123456", settings: withSender, ttlMinutes: 5 });
  check("401 auth error → NOT retried (1 call), ok:false", auth.ok === false && calls === 1);

  queue([errResp(429)]);
  const rate = await sendOtpEmail({ to: "a@b.com", code: "123456", settings: withSender, ttlMinutes: 5 });
  check("429 rate-limit → NOT retried (1 call), ok:false", rate.ok === false && calls === 1);

  queue([errResp(400, "sender_not_valid")]);
  const sender = await sendOtpEmail({ to: "a@b.com", code: "123456", settings: withSender, ttlMinutes: 5 });
  check("unverified-sender 400 → NOT retried (1 call), ok:false", sender.ok === false && calls === 1);

  globalThis.fetch = realFetch;
  check("no API key leaks into a result", !JSON.stringify([good, retried, auth, rate]).includes("DUMMY"));

  console.log(failures === 0 ? "\n✓ All Brevo client tests passed\n" : `\n✗ ${failures} test(s) failed\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
