import test from "node:test";
import assert from "node:assert/strict";
import { isValidUsZip, normalizeZip, ValidationError } from "../src/lib/zip-validation.js";
import { normalizeOrderPayload } from "../src/services/evaluation-service.js";

test("accepts valid 5-digit US ZIP codes", () => {
  assert.equal(isValidUsZip("85001"), true);
  assert.equal(normalizeZip("85001"), "85001");
});

test("accepts valid ZIP+4 codes", () => {
  assert.equal(isValidUsZip("85001-1234"), true);
  assert.equal(normalizeZip("85001-1234"), "85001-1234");
});

test("rejects fake alphanumeric US ZIP codes", () => {
  assert.throws(() => normalizeZip("AZ999"), ValidationError);
  assert.throws(() => normalizeZip("9999A"), ValidationError);
});

test("rejects normalized orders with invalid US ZIP codes", () => {
  assert.throws(
    () =>
      normalizeOrderPayload({
        id: "bad-zip-order",
        shipping_address: {
          zip: "AZ999",
          country_code: "US"
        },
        line_items: [],
        fulfillments: []
      }),
    ValidationError
  );
});
