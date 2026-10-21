/**
 * No database, production credentials or real Delhivery calls required.
 * Run: pnpm test:delhivery
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  authorisedDelhiveryWebhook,
  parseDelhiveryScan,
  shouldAdvanceTo,
  targetStatusFromScan,
} from "@/server/delivery/webhookScan";

const documentedPayload = {
  Shipment: {
    Status: {
      Status: "Manifested",
      StatusDateTime: "2019-01-09T17:10:42.767",
      StatusType: "UD",
      StatusLocation: "Chandigarh_Raiprkln_C (Chandigarh)",
      Instructions: "Manifest uploaded",
    },
    PickUpDate: "2019-01-09 17:10:42.543",
    NSLCode: "X-UCI",
    Sortcode: "IXC/MDP",
    ReferenceNo: "28",
    AWB: "123456789012",
  },
};

test("validates Delhivery's documented Scan Push JSON payload", () => {
  assert.deepEqual(parseDelhiveryScan(documentedPayload), {
    awb: "123456789012",
    status: "Manifested",
statusType: "UD",
    scannedAt: "2019-01-09T17:10:42.767",
  });
  assert.equal(parseDelhiveryScan(null), null);
  assert.equal(parseDelhiveryScan({ Shipment: { AWB: "123456789012" } }), null);
  assert.equal(parseDelhiveryScan({ Shipment: { ...documentedPayload.Shipment, AWB: "invalid ?" } }), null);
  assert.equal(parseDelhiveryScan({ Shipment: { ...documentedPayload.Shipment, Status: { Status: "" } } }), null);
});

test("authorization fails closed with missing or incorrect header", () => {
  assert.equal(authorisedDelhiveryWebhook(undefined, "key"), false);
  assert.equal(authorisedDelhiveryWebhook("correct-secret", null), false);
  assert.equal(authorisedDelhiveryWebhook("correct-secret", "incorrect"), false);
  assert.equal(authorisedDelhiveryWebhook("correct-secret", "correct-secret"), true);
});


test("maps only valid forward-shipment statuses", () => {
  assert.equal(targetStatusFromScan("Dispatched", "UD"), "OUT_FOR_DELIVERY");
  assert.equal(targetStatusFromScan("Out for Delivery", "UD"), "OUT_FOR_DELIVERY");
  assert.equal(targetStatusFromScan("Delivered", "DL"), "DELIVERED");

  assert.equal(targetStatusFromScan("Dispatched", "PU"), null);
  assert.equal(targetStatusFromScan("Delivered", "UD"), null);
  assert.equal(targetStatusFromScan("Dispatched", "DL"), null);

  for (const status of [
    "Undelivered",
    "Not Delivered",
    "RTO",
    "NDR",
    "Manifested"
  ]) {
    assert.equal(targetStatusFromScan(status, "UD"), null, status);
  }
});


test("duplicate, regressing or cancelled updates cannot advance an order", () => {
  assert.equal(shouldAdvanceTo("SHIPPED", "OUT_FOR_DELIVERY"), true);
  assert.equal(shouldAdvanceTo("OUT_FOR_DELIVERY", "DELIVERED"), true);
  assert.equal(shouldAdvanceTo("SHIPPED", "DELIVERED"), true);
  assert.equal(shouldAdvanceTo("OUT_FOR_DELIVERY", "OUT_FOR_DELIVERY"), false);
  assert.equal(shouldAdvanceTo("DELIVERED", "OUT_FOR_DELIVERY"), false);
  assert.equal(shouldAdvanceTo("CANCELLED", "DELIVERED"), false);
  assert.equal(shouldAdvanceTo("CONFIRMED", null), false);
});
