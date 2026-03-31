import { config } from "../config.js";
import { JsonStore } from "../lib/json-store.js";

const settingsStore = new JsonStore("settings.json", {
  icepackThresholdF: 80,
  reviewThresholdF: 72,
  icepackRequiredTag: config.tags.icepackRequired,
  manualReviewTag: config.tags.manualReview,
  eligibleProductIds: [],
  eligibleProductTypes: ["perishable"],
  weatherApiKeyConfigured: Boolean(config.weather.apiKey),
  weatherProvider: config.weather.provider
});

function normalizeUniqueStrings(values) {
  return [...new Set((values || []).map((value) => String(value).trim()).filter(Boolean))];
}

export async function getSettings() {
  const settings = await settingsStore.read();
  settings.weatherApiKeyConfigured = Boolean(config.weather.apiKey);
  settings.weatherProvider = config.weather.provider;
  return settings;
}

export async function updateSettings(input) {
  return settingsStore.update((current) => ({
    ...current,
    icepackThresholdF: Number(input.icepackThresholdF ?? current.icepackThresholdF),
    reviewThresholdF:
      input.reviewThresholdF === null || input.reviewThresholdF === ""
        ? null
        : Number(input.reviewThresholdF ?? current.reviewThresholdF),
    icepackRequiredTag: String(input.icepackRequiredTag || current.icepackRequiredTag).trim(),
    manualReviewTag: String(input.manualReviewTag || current.manualReviewTag).trim(),
    eligibleProductIds: normalizeUniqueStrings(
      input.eligibleProductIds ?? current.eligibleProductIds
    ),
    eligibleProductTypes: normalizeUniqueStrings(
      input.eligibleProductTypes ?? current.eligibleProductTypes
    )
  }));
}
