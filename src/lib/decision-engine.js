import { toIsoDate } from "./date-utils.js";

export const Decision = {
  ICEPACK_REQUIRED: "ICEPACK_REQUIRED",
  NO_ICEPACK: "NO_ICEPACK",
  MANUAL_REVIEW: "MANUAL_REVIEW"
};

export const ReasonCode = {
  NO_ELIGIBLE_PRODUCTS: "NO_ELIGIBLE_PRODUCTS",
  MISSING_DESTINATION_ZIP: "MISSING_DESTINATION_ZIP",
  MISSING_ETA: "MISSING_ETA",
  MISSING_WEATHER_FORECAST: "MISSING_WEATHER_FORECAST",
  TEMP_AT_OR_ABOVE_THRESHOLD: "TEMP_AT_OR_ABOVE_THRESHOLD",
  TEMP_BETWEEN_REVIEW_AND_REQUIRED: "TEMP_BETWEEN_REVIEW_AND_REQUIRED",
  TEMP_BELOW_THRESHOLD: "TEMP_BELOW_THRESHOLD"
};

export function getEligibleLineItems(order, settings) {
  const eligibleProductIds = new Set(settings.eligibleProductIds || []);
  const eligibleProductTypes = new Set(
    (settings.eligibleProductTypes || []).map((value) => String(value).toLowerCase())
  );

  return (order.lineItems || []).filter((item) => {
    const productId = item.productId ? String(item.productId) : "";
    const productType = String(item.productType || "").toLowerCase();
    return eligibleProductIds.has(productId) || (productType && eligibleProductTypes.has(productType));
  });
}

export function extractExpectedArrival(order) {
  const candidateDates = [];

  for (const fulfillment of order.fulfillments || []) {
    if (fulfillment.estimatedDeliveryAt) {
      candidateDates.push({
        value: fulfillment.estimatedDeliveryAt,
        source: "carrier_estimated_delivery"
      });
    }
    if (fulfillment.estimated_delivery_at) {
      candidateDates.push({
        value: fulfillment.estimated_delivery_at,
        source: "carrier_estimated_delivery"
      });
    }
  }

  for (const attribute of order.noteAttributes || []) {
    if (String(attribute.name || "").toLowerCase() === "expected_delivery_date") {
      candidateDates.push({
        value: attribute.value,
        source: "delivery_date_attribute"
      });
    }
  }

  const candidate = candidateDates
    .map((entry) => ({ ...entry, isoDate: toIsoDate(entry.value) }))
    .find((entry) => entry.isoDate);

  return candidate || { isoDate: null, source: "missing" };
}

export function buildTagPlan(decision, settings, existingTags = []) {
  const requiredTag = settings.icepackRequiredTag;
  const reviewTag = settings.manualReviewTag;
  const existing = new Set(existingTags);
  const add = [];
  const remove = [];

  if (decision === Decision.ICEPACK_REQUIRED) {
    if (!existing.has(requiredTag)) {
      add.push(requiredTag);
    }
    if (existing.has(reviewTag)) {
      remove.push(reviewTag);
    }
  } else if (decision === Decision.MANUAL_REVIEW) {
    if (!existing.has(reviewTag)) {
      add.push(reviewTag);
    }
    if (existing.has(requiredTag)) {
      remove.push(requiredTag);
    }
  } else {
    if (existing.has(reviewTag)) {
      remove.push(reviewTag);
    }
    if (existing.has(requiredTag)) {
      remove.push(requiredTag);
    }
  }

  return { add, remove };
}

export function evaluateIcepackNeed({ order, settings, forecast }) {
  const eligibleItems = getEligibleLineItems(order, settings);
  if (!eligibleItems.length) {
    return {
      decision: Decision.NO_ICEPACK,
      reasonCode: ReasonCode.NO_ELIGIBLE_PRODUCTS,
      targetDate: null,
      eligibleLineItems: [],
      forecastSummary: null
    };
  }

  const zip = order.shippingAddress?.zip || null;
  if (!zip) {
    return {
      decision: Decision.MANUAL_REVIEW,
      reasonCode: ReasonCode.MISSING_DESTINATION_ZIP,
      targetDate: null,
      eligibleLineItems: eligibleItems,
      forecastSummary: null
    };
  }

  const expectedArrival = extractExpectedArrival(order);
  if (!expectedArrival.isoDate) {
    return {
      decision: Decision.MANUAL_REVIEW,
      reasonCode: ReasonCode.MISSING_ETA,
      targetDate: null,
      expectedArrivalSource: expectedArrival.source,
      eligibleLineItems: eligibleItems,
      forecastSummary: null
    };
  }

  if (!forecast || forecast.maxTempF === null || forecast.maxTempF === undefined) {
    return {
      decision: Decision.MANUAL_REVIEW,
      reasonCode: ReasonCode.MISSING_WEATHER_FORECAST,
      targetDate: expectedArrival.isoDate,
      expectedArrivalSource: expectedArrival.source,
      eligibleLineItems: eligibleItems,
      forecastSummary: forecast || null
    };
  }

  const forecastSummary = {
    provider: forecast.provider,
    maxTempF: forecast.maxTempF,
    minTempF: forecast.minTempF,
    condition: forecast.condition
  };

  if (forecast.maxTempF >= settings.icepackThresholdF) {
    return {
      decision: Decision.ICEPACK_REQUIRED,
      reasonCode: ReasonCode.TEMP_AT_OR_ABOVE_THRESHOLD,
      targetDate: expectedArrival.isoDate,
      expectedArrivalSource: expectedArrival.source,
      eligibleLineItems: eligibleItems,
      forecastSummary
    };
  }

  if (
    settings.reviewThresholdF !== null &&
    settings.reviewThresholdF !== undefined &&
    forecast.maxTempF >= settings.reviewThresholdF
  ) {
    return {
      decision: Decision.MANUAL_REVIEW,
      reasonCode: ReasonCode.TEMP_BETWEEN_REVIEW_AND_REQUIRED,
      targetDate: expectedArrival.isoDate,
      expectedArrivalSource: expectedArrival.source,
      eligibleLineItems: eligibleItems,
      forecastSummary
    };
  }

  return {
    decision: Decision.NO_ICEPACK,
    reasonCode: ReasonCode.TEMP_BELOW_THRESHOLD,
    targetDate: expectedArrival.isoDate,
    expectedArrivalSource: expectedArrival.source,
    eligibleLineItems: eligibleItems,
    forecastSummary
  };
}
