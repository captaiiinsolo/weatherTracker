import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const envFilePath = path.join(rootDir, ".env");

if (fs.existsSync(envFilePath)) {
  const rawEnv = fs.readFileSync(envFilePath, "utf8");
  for (const line of rawEnv.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function toNumber(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  rootDir,
  dataDir: path.join(rootDir, "data"),
  publicDir: path.join(rootDir, "public"),
  port: toNumber(process.env.PORT, 3000),
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:3000",
  shopify: {
    shop: process.env.SHOPIFY_SHOP || "",
    adminAccessToken: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "",
    apiKey: process.env.SHOPIFY_API_KEY || "",
    apiSecret: process.env.SHOPIFY_API_SECRET || "",
    webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_API_SECRET || "",
    scopes:
      process.env.SHOPIFY_APP_SCOPES ||
      "read_orders,write_orders,read_products,write_products,read_fulfillments",
    embeddedPath: process.env.SHOPIFY_EMBEDDED_PATH || "/embedded"
  },
  weather: {
    provider: process.env.WEATHER_PROVIDER || "weatherapi",
    apiKey: process.env.WEATHER_API_KEY || ""
  },
  tags: {
    icepackRequired: process.env.ICEPACK_REQUIRED_TAG || "icepack_required",
    manualReview: process.env.MANUAL_REVIEW_TAG || "weather_review_needed"
  }
};

function hasRealConfigValue(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return false;
  }

  const lower = normalized.toLowerCase();
  return !(
    lower.startsWith("your_") ||
    lower.includes("your-token") ||
    lower.includes("your_store") ||
    lower.includes("your-store") ||
    lower.includes("example") ||
    lower === "shpat_your_token"
  );
}

export function isShopifyConfigured() {
  return hasRealConfigValue(config.shopify.shop) && hasRealConfigValue(config.shopify.adminAccessToken);
}

export function isWeatherConfigured() {
  return config.weather.provider === "demo" || hasRealConfigValue(config.weather.apiKey);
}

export function isEmbeddedAppConfigured() {
  return hasRealConfigValue(config.shopify.apiKey) && hasRealConfigValue(config.shopify.apiSecret);
}
