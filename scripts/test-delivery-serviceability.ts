/**
 * Automated tests for the checkout serviceability gate (serviceVerdict).
 * Run with:  pnpm test:delivery
 *
 * Pure logic — no database, no real Delhivery call. The Delhivery API is stubbed
 * via global.fetch. Exits non-zero on failure, so it can sit in CI.
 */
// Start UNCONFIGURED: .env.local carries no DELHIVERY_* vars.
delete process.env.DELHIVERY_API_TOKEN;
delete process.env.DELHIVERY_CLIENT_NAME;
delete process.env.DELHIVERY_PICKUP_NAME;

import { serviceVerdict } from "@/server/delivery/delhivery";

let failures = 0;
function check(name: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

const realFetch = globalThis.fetch;
type StubBody = { ok: boolean; status?: number; json: () => Promise<unknown> };
function stub(body: StubBody) {
  globalThis.fetch = (async () => body as unknown as Response) as typeof fetch;
}
function pin(pre_paid: string, cod: string): StubBody {
  return { ok: true, json: async () => ({ delivery_codes: [{ postal_code: { pin: "000000", pre_paid, cod } }] }) };
}
function configure() {
  process.env.DELHIVERY_API_TOKEN = "test-delhivery-token";
  process.env.DELHIVERY_CLIENT_NAME = "TESTCLIENT";
  process.env.DELHIVERY_PICKUP_NAME = "Test Pickup";
}
function unconfigure() {
  delete process.env.DELHIVERY_API_TOKEN;
  delete process.env.DELHIVERY_CLIENT_NAME;
  delete process.env.DELHIVERY_PICKUP_NAME;
}

async function main() {
  console.log("\nDelhivery serviceability gate tests");

  // Unconfigured → skip, and NO network call is made.
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }) as typeof fetch;
  const unconf = await serviceVerdict("110001");
  check("unconfigured → skip (checkout not blocked)", unconf.status === "skip");
  check("unconfigured makes no courier call", calls === 0);
  globalThis.fetch = realFetch;

  configure();

  stub(pin("Y", "N"));
  check("prepaid serviceable → ok", (await serviceVerdict("110001")).status === "ok");

  stub(pin("N", "Y"));
  check("cod-only (still serviceable) → ok", (await serviceVerdict("400001")).status === "ok");

  stub(pin("N", "N"));
  check("not serviceable → blocked", (await serviceVerdict("999998")).status === "blocked");

  stub({ ok: true, json: async () => ({ delivery_codes: [] }) });
  check("unknown pincode (empty result) → blocked", (await serviceVerdict("123456")).status === "blocked");

  stub({ ok: false, status: 500, json: async () => ({}) });
  check("courier API error → skip (fail open, sales not halted)", (await serviceVerdict("110001")).status === "skip");

  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  check("network failure → skip (fail open)", (await serviceVerdict("110001")).status === "skip");
  globalThis.fetch = realFetch;

  unconfigure();
  check("no token leaks into a verdict", !JSON.stringify(await serviceVerdict("110001")).includes("test-delhivery-token"));

  console.log(failures === 0 ? "\n✓ All serviceability gate tests passed\n" : `\n✗ ${failures} test(s) failed\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
