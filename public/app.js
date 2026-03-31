const $ = (selector) => document.querySelector(selector);
const appContext = window.__APP_CONTEXT__ || { embedded: false, shop: "" };

function splitTextarea(value) {
  return String(value || "")
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function formatTags(entry) {
  if (!entry?.length) {
    return "None";
  }
  return entry.join(", ");
}

async function getAuthHeaders() {
  if (!appContext.embedded || typeof window.shopify?.idToken !== "function") {
    return {};
  }

  const idToken = await window.shopify.idToken();
  return idToken ? { Authorization: `Bearer ${idToken}` } : {};
}

async function apiFetch(url, options = {}) {
  const authHeaders = await getAuthHeaders();
  const headers = {
    ...(options.headers || {}),
    ...authHeaders
  };

  return fetch(url, {
    ...options,
    headers
  });
}

function renderTable(container, columns, rows) {
  if (!rows.length) {
    container.innerHTML = `<p class="empty">No records yet.</p>`;
    return;
  }

  const header = columns.map((column) => `<th>${column.label}</th>`).join("");
  const body = rows
    .map((row) => {
      const cells = columns.map((column) => `<td>${column.render(row)}</td>`).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  container.innerHTML = `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

async function loadStatus() {
  const response = await apiFetch("/api/status");
  const status = await response.json();
  $("#statusCard").innerHTML = `
    <h3>Setup status</h3>
    <ul class="status-list">
      <li>Shopify API: <strong>${status.shopifyConfigured ? "Ready" : "Missing credentials"}</strong></li>
      <li>Embedded app: <strong>${status.embeddedAppConfigured ? "Configured" : "Missing API key/secret"}</strong></li>
      <li>Embedded session: <strong>${status.embedded?.active ? status.embedded.shopDomain : "Local mode"}</strong></li>
      <li>Weather provider: <strong>${status.weatherConfigured ? "Ready" : "Demo mode"}</strong></li>
      <li>Known shops: <strong>${status.embedded?.knownShops || 0}</strong></li>
      <li>Cached orders: <strong>${status.counts.cachedOrders}</strong></li>
      <li>Recent evaluations: <strong>${status.counts.recentEvaluations}</strong></li>
    </ul>
  `;
}

async function loadSettings() {
  const response = await apiFetch("/api/settings");
  const settings = await response.json();
  const form = $("#settingsForm");
  form.icepackThresholdF.value = settings.icepackThresholdF;
  form.reviewThresholdF.value = settings.reviewThresholdF ?? "";
  form.icepackRequiredTag.value = settings.icepackRequiredTag;
  form.manualReviewTag.value = settings.manualReviewTag;
  form.eligibleProductIds.value = (settings.eligibleProductIds || []).join("\n");
  form.eligibleProductTypes.value = (settings.eligibleProductTypes || []).join("\n");
}

async function loadOrders() {
  const response = await apiFetch("/api/orders");
  const orders = await response.json();
  renderTable(
    $("#ordersTable"),
    [
      { label: "Order", render: (row) => row.name || row.id },
      { label: "Shop", render: (row) => row.shopDomain || "Local" },
      { label: "ZIP", render: (row) => row.shippingAddress?.zip || "Missing" },
      {
        label: "Items",
        render: (row) => String(row.lineItems?.length || 0)
      },
      { label: "Tags", render: (row) => formatTags(row.tags) }
    ],
    orders
  );
}

async function loadEvaluations() {
  const response = await apiFetch("/api/evaluations");
  const evaluations = await response.json();
  renderTable(
    $("#evaluationsTable"),
    [
      { label: "Order", render: (row) => row.orderName || row.orderId },
      { label: "Decision", render: (row) => row.decision },
      { label: "Reason", render: (row) => row.reasonCode },
      { label: "Shop", render: (row) => row.shopDomain || "Local" },
      { label: "Arrival", render: (row) => row.expectedArrivalDate || "Unknown" },
      {
        label: "Forecast",
        render: (row) =>
          row.forecastSummary?.maxTempF !== undefined && row.forecastSummary?.maxTempF !== null
            ? `${row.forecastSummary.maxTempF}F / ${row.forecastSummary.condition || "Unknown"}`
            : "Missing"
      },
      {
        label: "Tag sync",
        render: (row) => `+ ${formatTags(row.tagsToAdd)} / - ${formatTags(row.tagsToRemove)}`
      }
    ],
    evaluations
  );
}

async function refreshAll() {
  await Promise.all([loadStatus(), loadSettings(), loadOrders(), loadEvaluations()]);
}

$("#settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = {
    icepackThresholdF: Number(form.icepackThresholdF.value),
    reviewThresholdF: form.reviewThresholdF.value ? Number(form.reviewThresholdF.value) : null,
    icepackRequiredTag: form.icepackRequiredTag.value,
    manualReviewTag: form.manualReviewTag.value,
    eligibleProductIds: splitTextarea(form.eligibleProductIds.value),
    eligibleProductTypes: splitTextarea(form.eligibleProductTypes.value)
  };

  await apiFetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  await refreshAll();
});

$("#evaluateForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const payloadText = form.orderPayload.value.trim();
  const orderId = form.orderId.value.trim();
  const payload = payloadText ? { order: JSON.parse(payloadText) } : { orderId };

  const response = await apiFetch("/api/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  $("#evaluationResult").textContent = JSON.stringify(result, null, 2);
  await refreshAll();
});

refreshAll().catch((error) => {
  $("#evaluationResult").textContent = JSON.stringify(
    { error: error instanceof Error ? error.message : "Failed to load app context." },
    null,
    2
  );
});
