import assert from "node:assert/strict";
import { parseDelhiveryServiceability } from "../src/server/delivery/delhivery";

const wrap = (pin: string, pre_paid: unknown, cod: unknown, remarks = "") => ({
  delivery_codes: [{ postal_code: { pin, pre_paid, cod, remarks } }],
});
assert.deepEqual(parseDelhiveryServiceability("174101", wrap("174101", "Y", "N")), {
  serviceable: true, prepaid: true, cod: false,
});
assert.deepEqual(parseDelhiveryServiceability("174101", wrap("174101", "n", "Y")), {
  serviceable: false, prepaid: false, cod: true,
});
assert.equal(parseDelhiveryServiceability("174101", wrap("110001", "Y", "Y")), null);
assert.equal(parseDelhiveryServiceability("174101", wrap("174101", undefined, "Y")), null);
assert.equal(parseDelhiveryServiceability("174101", { unexpected: [] }), null);
assert.deepEqual(parseDelhiveryServiceability("174101", { delivery_codes: [] }), {
  serviceable: false, prepaid: false, cod: false,
});
assert.deepEqual(parseDelhiveryServiceability("174101", wrap("174101", "Y", "Y", "Embargo")), {
  serviceable: false, prepaid: false, cod: false,
});
console.log("Delhivery prepaid serviceability parser tests passed.");
