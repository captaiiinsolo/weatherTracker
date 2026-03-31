import crypto from "node:crypto";
import { isShopifyConfigured } from "../config.js";
import { buildTagPlan, evaluateIcepackNeed, extractExpectedArrival } from "../lib/decision-engine.js";
import { getForecastForArrival } from "../lib/weather-provider.js";
import { removeOrderTags, updateOrderTags } from "../lib/shopify.js";
import { normalizeZip } from "../lib/zip-validation.js";
import { getSettings } from "./settings-service.js";
import { getOrderSnapshot, saveEvaluation, saveOrderSnapshot } from "./order-store.js";
import { getShopRecord } from "./shop-store.js";

function normalizeLineItem(item) {
  return {
    id:
      item.id ||
      item.admin_graphql_api_id ||
      item.variant_id ||
      crypto.randomUUID(),
    title: item.title || item.name || "Untitled item",
    quantity: item.quantity || 1,
    productId: item.product_id || item.productId || item.product?.id || "",
    productType: item.product_type || item.productType || item.product?.productType || ""
  };
}

function normalizeFulfillment(fulfillment) {
  return {
    id: fulfillment.id || fulfillment.admin_graphql_api_id || "",
    estimatedDeliveryAt:
      fulfillment.estimated_delivery_at ||
      fulfillment.estimatedDeliveryAt ||
      fulfillment.shipment_status?.estimated_delivery_at ||
      null
  };
}

export function normalizeOrderPayload(payload, options = {}) {
  const shippingAddress = payload.shipping_address || payload.shippingAddress || {};
  const countryCode = shippingAddress.country_code || shippingAddress.countryCode || "US";

  return {
    id: payload.id || payload.admin_graphql_api_id || payload.order_id || "",
    graphQlId:
      payload.admin_graphql_api_id ||
      (payload.id ? `gid://shopify/Order/${String(payload.id).replace("gid://shopify/Order/", "")}` : ""),
    name: payload.name || payload.order_number || `Order ${payload.id || payload.order_id || ""}`.trim(),
    tags: Array.isArray(payload.tags)
      ? payload.tags
      : String(payload.tags || "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
    shippingAddress: {
      zip: normalizeZip(shippingAddress.zip || "", countryCode),
      city: shippingAddress.city || "",
      provinceCode: shippingAddress.province_code || shippingAddress.provinceCode || "",
      countryCode
    },
    noteAttributes: payload.note_attributes || payload.noteAttributes || [],
    lineItems: (payload.line_items || payload.lineItems || []).map(normalizeLineItem),
    fulfillments: (payload.fulfillments || []).map(normalizeFulfillment),
    shopDomain:
      options.shopDomain ||
      payload.shopDomain ||
      payload.shop_domain ||
      payload.myshopify_domain ||
      "",
    rawPayload: payload
  };
}

function buildEvaluationRecord({ order, result, tagPlan, forecast, settings }) {
  return {
    orderId: order.id,
    orderName: order.name,
    shopDomain: order.shopDomain || "",
    decision: result.decision,
    reasonCode: result.reasonCode,
    expectedArrivalDate: result.targetDate,
    expectedArrivalSource: result.expectedArrivalSource || "missing",
    destinationZip: order.shippingAddress?.zip || "",
    eligibleLineItems: result.eligibleLineItems.map((item) => ({
      title: item.title,
      quantity: item.quantity,
      productId: item.productId
    })),
    forecastSummary: result.forecastSummary || forecast,
    tagsToAdd: tagPlan.add,
    tagsToRemove: tagPlan.remove,
    appliedTags: {
      required: settings.icepackRequiredTag,
      review: settings.manualReviewTag
    },
    createdAt: new Date().toISOString()
  };
}

async function syncShopifyTags(order, tagPlan) {
  const storedShop = order.shopDomain ? await getShopRecord(order.shopDomain) : null;
  const accessToken = storedShop?.offlineAccessToken || null;
  const hasDynamicShopAccess = Boolean(order.shopDomain && accessToken);

  if ((!isShopifyConfigured() && !hasDynamicShopAccess) || !order.graphQlId) {
    return { mode: "local-only" };
  }

  if (tagPlan.add.length) {
    await updateOrderTags({
      shopDomain: order.shopDomain,
      accessToken,
      orderId: order.graphQlId,
      tags: tagPlan.add
    });
  }

  if (tagPlan.remove.length) {
    await removeOrderTags({
      shopDomain: order.shopDomain,
      accessToken,
      orderId: order.graphQlId,
      tags: tagPlan.remove
    });
  }

  return {
    mode: hasDynamicShopAccess ? "shopify-embedded" : "shopify",
    added: tagPlan.add,
    removed: tagPlan.remove
  };
}

export async function evaluateIncomingOrder(payload, options = {}) {
  const order = normalizeOrderPayload(payload, options);
  await saveOrderSnapshot(order);
  return evaluateStoredOrder(order.id);
}

export async function evaluateStoredOrder(orderId) {
  const order = await getOrderSnapshot(orderId);
  if (!order) {
    throw new Error(`Order ${orderId} is not available in the local order cache.`);
  }

  const settings = await getSettings();
  const expectedArrival = extractExpectedArrival(order);
  let forecast = null;

  if (order.shippingAddress?.zip && expectedArrival.isoDate) {
    forecast = await getForecastForArrival({
      zip: order.shippingAddress.zip,
      countryCode: order.shippingAddress.countryCode || "US",
      targetDate: expectedArrival.isoDate
    });
  }

  const result = evaluateIcepackNeed({ order, settings, forecast });
  const tagPlan = buildTagPlan(result.decision, settings, order.tags);
  const syncResult = await syncShopifyTags(order, tagPlan);
  const record = buildEvaluationRecord({ order, result, tagPlan, forecast, settings });
  record.sync = syncResult;

  await saveEvaluation(record);
  await saveOrderSnapshot({
    ...order,
    tags: [...new Set(order.tags.filter((tag) => !tagPlan.remove.includes(tag)).concat(tagPlan.add))]
  });

  return record;
}
