import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTagPlan,
  Decision,
  evaluateIcepackNeed,
  ReasonCode
} from "../src/lib/decision-engine.js";

const settings = {
  icepackThresholdF: 80,
  reviewThresholdF: 72,
  icepackRequiredTag: "icepack_required",
  manualReviewTag: "weather_review_needed",
  eligibleProductIds: ["42"],
  eligibleProductTypes: ["perishable"]
};

function baseOrder(overrides = {}) {
  return {
    id: "1",
    shippingAddress: { zip: "94107", countryCode: "US" },
    lineItems: [{ title: "Chocolate", quantity: 1, productId: "42", productType: "perishable" }],
    fulfillments: [{ estimatedDeliveryAt: "2026-04-01T18:00:00.000Z" }],
    noteAttributes: [],
    tags: [],
    ...overrides
  };
}

test("marks icepack required when max temp exceeds threshold", () => {
  const result = evaluateIcepackNeed({
    order: baseOrder(),
    settings,
    forecast: { provider: "demo", maxTempF: 92, minTempF: 68, condition: "Hot" }
  });

  assert.equal(result.decision, Decision.ICEPACK_REQUIRED);
  assert.equal(result.reasonCode, ReasonCode.TEMP_AT_OR_ABOVE_THRESHOLD);
});

test("routes to manual review when ETA is missing", () => {
  const result = evaluateIcepackNeed({
    order: baseOrder({ fulfillments: [] }),
    settings,
    forecast: null
  });

  assert.equal(result.decision, Decision.MANUAL_REVIEW);
  assert.equal(result.reasonCode, ReasonCode.MISSING_ETA);
});

test("returns no icepack when no eligible products are in the cart", () => {
  const result = evaluateIcepackNeed({
    order: baseOrder({
      lineItems: [{ title: "Sticker", quantity: 1, productId: "99", productType: "gift" }]
    }),
    settings,
    forecast: { provider: "demo", maxTempF: 95, minTempF: 68, condition: "Hot" }
  });

  assert.equal(result.decision, Decision.NO_ICEPACK);
  assert.equal(result.reasonCode, ReasonCode.NO_ELIGIBLE_PRODUCTS);
});

test("buildTagPlan is idempotent with opposing tags", () => {
  const plan = buildTagPlan(Decision.MANUAL_REVIEW, settings, ["icepack_required"]);
  assert.deepEqual(plan, {
    add: ["weather_review_needed"],
    remove: ["icepack_required"]
  });
});
