/**
 * Automated tests for the Meta WhatsApp webhook (/api/whatsapp/webhook).
 * Run with:  pnpm test:whatsapp
 *
 * Exercises the real route handlers and the status-update path against the
 * database, using throwaway rows that are cleaned up at the end. Exits non-zero
 * if anything fails, so it can sit in CI. No real Meta call is made.
 */
import { createHmac } from "node:crypto";

import { eq } from "drizzle-orm";

// Test credentials — set BEFORE the handlers read them (they read env per call).
process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "test-verify-token-123";
process.env.WHATSAPP_APP_SECRET = "test-app-secret-abc";

import { db } from "@/server/db";
import { whatsappMessages } from "@/server/db/schema";
import { GET, POST } from "@/app/api/whatsapp/webhook/route";

const VERIFY = "test-verify-token-123";
const SECRET = "test-app-secret-abc";
const WAMID = "wamid.TEST_WEBHOOK_SPEC";
const PHONE = "9000009999";

let failures = 0;
function check(name: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

function sign(body: string): string {
  return "sha256=" + createHmac("sha256", SECRET).update(body, "utf8").digest("hex");
}

function getReq(params: Record<string, string>): Request {
  const u = new URL("https://www.shivradium.com/api/whatsapp/webhook");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return new Request(u, { method: "GET" });
}

function postReq(body: string, signature: string | null): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature) headers["x-hub-signature-256"] = signature;
  return new Request("https://www.shivradium.com/api/whatsapp/webhook", { method: "POST", headers, body });
}

function statusBody(id: string, status: string): string {
  return JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id, status }] } }] }] });
}

async function currentStatus(): Promise<string | null> {
  const rows = await db.select({ status: whatsappMessages.status }).from(whatsappMessages).where(eq(whatsappMessages.providerMessageId, WAMID)).limit(1);
  return rows[0]?.status ?? null;
}

async function main() {
  console.log("\nWhatsApp webhook tests");

  // --- GET verification -----------------------------------------------------
  const okGet = await GET(getReq({ "hub.mode": "subscribe", "hub.verify_token": VERIFY, "hub.challenge": "CHALLENGE42" }));
  check("GET with correct token returns challenge (200)", okGet.status === 200 && (await okGet.text()) === "CHALLENGE42");

  const badGet = await GET(getReq({ "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "x" }));
  check("GET with wrong token is rejected (403)", badGet.status === 403);

  const noModeGet = await GET(getReq({ "hub.verify_token": VERIFY, "hub.challenge": "x" }));
  check("GET without hub.mode=subscribe is rejected (403)", noModeGet.status === 403);

  // --- POST signature + status updates --------------------------------------
  // Seed a throwaway message row the webhook can update.
  await db.delete(whatsappMessages).where(eq(whatsappMessages.providerMessageId, WAMID));
  await db.insert(whatsappMessages).values({
    kind: "order",
    category: "UTILITY",
    toPhone: PHONE,
    template: "order_confirmed_test",
    status: "sent",
    providerMessageId: WAMID,
    mock: false,
  });

  const unsigned = await POST(postReq(statusBody(WAMID, "delivered"), null));
  check("POST without a signature is rejected (401)", unsigned.status === 401);
  check("…and the status is left unchanged", (await currentStatus()) === "sent");

  const badSig = await POST(postReq(statusBody(WAMID, "delivered"), "sha256=deadbeef"));
  check("POST with a wrong signature is rejected (401)", badSig.status === 401);

  const deliveredBody = statusBody(WAMID, "delivered");
  const okDelivered = await POST(postReq(deliveredBody, sign(deliveredBody)));
  check("POST with a valid signature is accepted (200)", okDelivered.status === 200);
  check("…and the delivery status is stored (delivered)", (await currentStatus()) === "delivered");

  // Duplicate of the same event is idempotent.
  const dup = await POST(postReq(deliveredBody, sign(deliveredBody)));
  check("Duplicate event is handled safely (200, still delivered)", dup.status === 200 && (await currentStatus()) === "delivered");

  // read + failed statuses.
  const readBody = statusBody(WAMID, "read");
  await POST(postReq(readBody, sign(readBody)));
  check("'read' status is applied", (await currentStatus()) === "read");

  const failedBody = statusBody(WAMID, "failed");
  await POST(postReq(failedBody, sign(failedBody)));
  check("'failed' status is applied", (await currentStatus()) === "failed");

  // Unknown status is ignored (not written).
  const bogusBody = statusBody(WAMID, "not_a_real_status");
  const bogus = await POST(postReq(bogusBody, sign(bogusBody)));
  check("Unknown status is ignored but still 200", bogus.status === 200 && (await currentStatus()) === "failed");

  // --- cleanup --------------------------------------------------------------
  await db.delete(whatsappMessages).where(eq(whatsappMessages.providerMessageId, WAMID));

  console.log(failures === 0 ? "\n✓ All webhook tests passed\n" : `\n✗ ${failures} webhook test(s) failed\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
