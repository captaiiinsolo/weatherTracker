import crypto from "node:crypto";
import { config, isShopifyConfigured } from "../config.js";

function shopifyGraphqlUrl(shopDomain) {
  return `https://${shopDomain}/admin/api/2025-01/graphql.json`;
}

export function verifyShopifyWebhook(rawBody, hmacHeader) {
  if (!config.shopify.webhookSecret) {
    return false;
  }

  const digest = crypto
    .createHmac("sha256", config.shopify.webhookSecret)
    .update(rawBody, "utf8")
    .digest("base64");

  const provided = Buffer.from(hmacHeader || "", "utf8");
  const expected = Buffer.from(digest, "utf8");

  if (provided.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(provided, expected);
}

function resolveShopCredentials(context = {}) {
  const shopDomain = context.shopDomain || config.shopify.shop;
  const accessToken = context.accessToken || config.shopify.adminAccessToken;

  if (!shopDomain || !accessToken || (!context.shopDomain && !isShopifyConfigured())) {
    throw new Error("Shopify credentials are missing.");
  }

  return { shopDomain, accessToken };
}

export async function shopifyGraphql({ shopDomain, accessToken, query, variables = {} }) {
  const credentials = resolveShopCredentials({ shopDomain, accessToken });

  const response = await fetch(shopifyGraphqlUrl(credentials.shopDomain), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": credentials.accessToken
    },
    body: JSON.stringify({ query, variables })
  });

  const payload = await response.json();
  if (!response.ok || payload.errors) {
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(payload.errors || payload)}`);
  }

  return payload.data;
}

export async function updateOrderTags({ shopDomain, accessToken, orderId, tags }) {
  const mutation = `
    mutation UpdateOrderTags($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        userErrors {
          field
          message
        }
      }
    }
  `;

  const result = await shopifyGraphql({
    shopDomain,
    accessToken,
    query: mutation,
    variables: { id: orderId, tags }
  });
  const errors = result.tagsAdd?.userErrors || [];
  if (errors.length) {
    throw new Error(`Unable to add tags: ${JSON.stringify(errors)}`);
  }
}

export async function removeOrderTags({ shopDomain, accessToken, orderId, tags }) {
  if (!tags.length) {
    return;
  }

  const mutation = `
    mutation RemoveOrderTags($id: ID!, $tags: [String!]!) {
      tagsRemove(id: $id, tags: $tags) {
        userErrors {
          field
          message
        }
      }
    }
  `;

  const result = await shopifyGraphql({
    shopDomain,
    accessToken,
    query: mutation,
    variables: { id: orderId, tags }
  });
  const errors = result.tagsRemove?.userErrors || [];
  if (errors.length) {
    throw new Error(`Unable to remove tags: ${JSON.stringify(errors)}`);
  }
}
