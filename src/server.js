import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import {
  config,
  isEmbeddedAppConfigured,
  isShopifyConfigured,
  isWeatherConfigured
} from "./config.js";
import { authenticateEmbeddedRequest } from "./lib/embedded-auth.js";
import { verifyShopifyWebhook } from "./lib/shopify.js";
import { ValidationError } from "./lib/zip-validation.js";
import {
  evaluateIncomingOrder,
  evaluateStoredOrder,
  normalizeOrderPayload
} from "./services/evaluation-service.js";
import {
  getOrderSnapshot,
  listEvaluations,
  listOrders,
  saveOrderSnapshot
} from "./services/order-store.js";
import { listShops, removeShopRecord } from "./services/shop-store.js";
import { getSettings, updateSettings } from "./services/settings-service.js";

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response, statusCode, payload, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, { "Content-Type": contentType });
  response.end(payload);
}

async function readRawBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonBody(request) {
  const raw = await readRawBody(request);
  return raw ? JSON.parse(raw) : {};
}

async function serveStaticAsset(response, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.join(config.publicDir, requestedPath);
  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const contentType =
      ext === ".html"
        ? "text/html; charset=utf-8"
        : ext === ".js"
          ? "application/javascript; charset=utf-8"
          : ext === ".css"
            ? "text/css; charset=utf-8"
            : "application/octet-stream";
    sendText(response, 200, file, contentType);
    return true;
  } catch {
    return false;
  }
}

function renderEmbeddedHtml(shop = "") {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="shopify-api-key" content="${config.shopify.apiKey}" />
    <title>Icepack Decision Admin</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
    <script>
      window.__APP_CONTEXT__ = {
        embedded: true,
        shop: ${JSON.stringify(shop)}
      };
    </script>
    <main class="shell">
      <section class="hero">
        <div>
          <p class="eyebrow">Shopify Embedded Admin</p>
          <h1>Icepack Decision Admin</h1>
          <p class="lede">
            Embedded app view for live store setup, weather-driven shipment decisions, and order tagging.
          </p>
        </div>
        <div class="status-card" id="statusCard">Loading status...</div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>Rule Settings</h2>
          <p>Global thresholds and tagging behavior for temperature-sensitive shipments.</p>
        </div>
        <form id="settingsForm" class="grid-form">
          <label>
            Icepack threshold (F)
            <input type="number" name="icepackThresholdF" required />
          </label>
          <label>
            Manual review threshold (F)
            <input type="number" name="reviewThresholdF" />
          </label>
          <label>
            Icepack tag
            <input type="text" name="icepackRequiredTag" required />
          </label>
          <label>
            Review tag
            <input type="text" name="manualReviewTag" required />
          </label>
          <label class="wide">
            Eligible product IDs
            <textarea name="eligibleProductIds" rows="3"></textarea>
          </label>
          <label class="wide">
            Eligible product types
            <textarea name="eligibleProductTypes" rows="2"></textarea>
          </label>
          <button type="submit">Save settings</button>
        </form>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>Manual Evaluation</h2>
          <p>Run store-aware evaluations using the current embedded app session.</p>
        </div>
        <form id="evaluateForm" class="grid-form">
          <label>
            Cached order ID
            <input type="text" name="orderId" placeholder="gid://shopify/Order/1234567890" />
          </label>
          <label class="wide">
            Sample order JSON
            <textarea name="orderPayload" rows="8" placeholder='{"id": 1, "line_items": []}'></textarea>
          </label>
          <button type="submit">Run evaluation</button>
        </form>
        <pre id="evaluationResult" class="result-box"></pre>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>Cached Orders</h2>
          <p>Recent orders received through webhook traffic or manual embedded evaluations.</p>
        </div>
        <div id="ordersTable" class="table-shell"></div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>Recent Evaluations</h2>
          <p>Decision history with shop-aware tag sync actions.</p>
        </div>
        <div id="evaluationsTable" class="table-shell"></div>
      </section>
    </main>

    <script type="module" src="/app.js"></script>
  </body>
</html>`;
}

async function handleApi(request, response, pathname, requestContext) {
  if (request.method === "GET" && pathname === "/api/status") {
    const settings = await getSettings();
    const orders = await listOrders();
    const evaluations = await listEvaluations(20);
    const shops = await listShops();
    sendJson(response, 200, {
      appBaseUrl: config.appBaseUrl,
      shopifyConfigured: isShopifyConfigured(),
      embeddedAppConfigured: isEmbeddedAppConfigured(),
      weatherConfigured: isWeatherConfigured(),
      settings,
      embedded: {
        active: Boolean(requestContext?.shopDomain),
        shopDomain: requestContext?.shopDomain || "",
        knownShops: shops.length
      },
      counts: {
        cachedOrders: orders.length,
        recentEvaluations: evaluations.length
      }
    });
    return true;
  }

  if (request.method === "GET" && pathname === "/api/settings") {
    sendJson(response, 200, await getSettings());
    return true;
  }

  if (request.method === "GET" && pathname === "/api/embedded/session") {
    sendJson(response, 200, {
      embedded: Boolean(requestContext?.shopDomain),
      shopDomain: requestContext?.shopDomain || "",
      offlineTokenReady: Boolean(requestContext?.shopRecord?.offlineAccessToken)
    });
    return true;
  }

  if (request.method === "PUT" && pathname === "/api/settings") {
    const body = await readJsonBody(request);
    sendJson(response, 200, await updateSettings(body));
    return true;
  }

  if (request.method === "GET" && pathname === "/api/orders") {
    const orders = await listOrders();
    sendJson(
      response,
      200,
      requestContext?.shopDomain
        ? orders.filter((entry) => entry.shopDomain === requestContext.shopDomain)
        : orders
    );
    return true;
  }

  if (request.method === "POST" && pathname === "/api/orders") {
    const body = await readJsonBody(request);
    await saveOrderSnapshot(
      normalizeOrderPayload(body.order || body, { shopDomain: requestContext?.shopDomain || "" })
    );
    sendJson(response, 201, { ok: true });
    return true;
  }

  if (request.method === "GET" && pathname === "/api/evaluations") {
    const evaluations = await listEvaluations(50);
    sendJson(
      response,
      200,
      requestContext?.shopDomain
        ? evaluations.filter((entry) => entry.shopDomain === requestContext.shopDomain)
        : evaluations
    );
    return true;
  }

  if (request.method === "POST" && pathname === "/api/evaluate") {
    const body = await readJsonBody(request);
    if (body.order) {
      sendJson(
        response,
        200,
        await evaluateIncomingOrder(body.order, { shopDomain: requestContext?.shopDomain || "" })
      );
      return true;
    }
    if (body.orderId) {
      sendJson(response, 200, await evaluateStoredOrder(body.orderId));
      return true;
    }
    sendJson(response, 400, { error: "Provide order or orderId." });
    return true;
  }

  if (request.method === "GET" && pathname.startsWith("/api/orders/")) {
    const orderId = pathname.split("/").pop();
    const order = await getOrderSnapshot(orderId);
    if (!order) {
      sendJson(response, 404, { error: "Order not found." });
      return true;
    }
    sendJson(response, 200, order);
    return true;
  }

  return false;
}

async function handleWebhook(request, response, pathname) {
  if (request.method !== "POST") {
    return false;
  }

  const rawBody = await readRawBody(request);
  const hmac = request.headers["x-shopify-hmac-sha256"];
  if (config.shopify.webhookSecret && !verifyShopifyWebhook(rawBody, hmac)) {
    sendJson(response, 401, { error: "Invalid Shopify webhook signature." });
    return true;
  }

  const payload = rawBody ? JSON.parse(rawBody) : {};
  const shopDomain = String(request.headers["x-shopify-shop-domain"] || "");

  if (pathname === "/webhooks/orders/create" || pathname === "/webhooks/orders/updated") {
    const result = await evaluateIncomingOrder(payload, { shopDomain });
    sendJson(response, 200, { ok: true, result });
    return true;
  }

  if (pathname === "/webhooks/fulfillments/update") {
    const existingOrder = await getOrderSnapshot(payload.order_id);
    const mergedOrder = {
      ...(existingOrder || { id: payload.order_id, name: `#${payload.order_id}` }),
      shopDomain: shopDomain || existingOrder?.shopDomain || "",
      fulfillments: [payload],
      rawPayload: payload
    };
    await saveOrderSnapshot(mergedOrder);
    const result = await evaluateStoredOrder(payload.order_id);
    sendJson(response, 200, { ok: true, result });
    return true;
  }

  if (pathname === "/webhooks/app/uninstalled") {
    if (shopDomain) {
      await removeShopRecord(shopDomain);
    }
    sendJson(response, 200, { ok: true, removedShop: shopDomain });
    return true;
  }

  return false;
}

function withErrorBoundary(handler) {
  return async (request, response) => {
    try {
      await handler(request, response);
    } catch (error) {
      if (error instanceof ValidationError) {
        sendJson(response, 400, { error: error.message });
        return;
      }

      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Unexpected server error"
      });
    }
  };
}

const server = http.createServer(
  withErrorBoundary(async (request, response) => {
    const url = new URL(request.url, config.appBaseUrl);
    const pathname = url.pathname;
    const requestContext =
      pathname.startsWith("/api/") && isEmbeddedAppConfigured()
        ? await authenticateEmbeddedRequest(request)
        : null;

    if (pathname.startsWith("/api/")) {
      const handled = await handleApi(request, response, pathname, requestContext);
      if (handled) {
        return;
      }
    }

    if (pathname.startsWith("/webhooks/")) {
      const handled = await handleWebhook(request, response, pathname);
      if (handled) {
        return;
      }
    }

    if (request.method === "GET" && pathname === config.shopify.embeddedPath) {
      sendText(response, 200, renderEmbeddedHtml(url.searchParams.get("shop") || ""), "text/html; charset=utf-8");
      return;
    }

    if (request.method === "GET" && (await serveStaticAsset(response, pathname))) {
      return;
    }

    sendJson(response, 404, { error: "Route not found." });
  })
);

server.listen(config.port, () => {
  console.log(`Shopify Icepack Decision app listening on ${config.appBaseUrl}`);
});
