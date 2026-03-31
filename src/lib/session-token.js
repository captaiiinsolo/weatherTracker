import crypto from "node:crypto";
import { config } from "../config.js";

function base64UrlToBuffer(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = 4 - (normalized.length % 4 || 4);
  return Buffer.from(normalized + "=".repeat(padding % 4), "base64");
}

function decodeJson(segment) {
  return JSON.parse(base64UrlToBuffer(segment).toString("utf8"));
}

function toBase64Url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function extractShopDomainFromDest(dest) {
  try {
    return new URL(dest).hostname;
  } catch {
    return "";
  }
}

export function extractBearerToken(headers) {
  const raw = headers.authorization || headers.Authorization || "";
  const [scheme, token] = String(raw).split(" ");
  return scheme?.toLowerCase() === "bearer" ? token : "";
}

export function verifySessionToken(sessionToken) {
  if (!config.shopify.apiKey || !config.shopify.apiSecret) {
    throw new Error("Shopify app credentials are required to verify session tokens.");
  }

  const parts = String(sessionToken || "").split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid Shopify session token format.");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJson(encodedHeader);
  const payload = decodeJson(encodedPayload);

  if (header.alg !== "HS256") {
    throw new Error("Unsupported Shopify session token algorithm.");
  }

  const signature = crypto
    .createHmac("sha256", config.shopify.apiSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();

  if (toBase64Url(signature) !== encodedSignature) {
    throw new Error("Invalid Shopify session token signature.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.nbf && payload.nbf > now) {
    throw new Error("Shopify session token is not active yet.");
  }
  if (payload.exp && payload.exp < now) {
    throw new Error("Shopify session token has expired.");
  }
  if (payload.aud !== config.shopify.apiKey) {
    throw new Error("Shopify session token audience does not match the app API key.");
  }

  const shopDomain = extractShopDomainFromDest(payload.dest);
  if (!shopDomain) {
    throw new Error("Shopify session token is missing a valid shop destination.");
  }

  return {
    ...payload,
    shopDomain
  };
}
