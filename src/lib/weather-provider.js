import { config } from "../config.js";

function buildWeatherApiUrl(zip, countryCode, targetDate) {
  const location = countryCode ? `${zip},${countryCode}` : zip;
  const url = new URL("https://api.weatherapi.com/v1/forecast.json");
  url.searchParams.set("key", config.weather.apiKey);
  url.searchParams.set("q", location);
  url.searchParams.set("dt", targetDate);
  url.searchParams.set("days", "1");
  url.searchParams.set("aqi", "no");
  url.searchParams.set("alerts", "no");
  return url.toString();
}

function createDemoForecast(zip, targetDate) {
  const zipSeed = String(zip || "")
    .split("")
    .reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const maxTempF = 60 + (zipSeed % 35);
  return {
    provider: "demo",
    targetDate,
    maxTempF,
    minTempF: Math.max(35, maxTempF - 18),
    condition: "Synthetic forecast for local development"
  };
}

export async function getForecastForArrival({ zip, countryCode = "US", targetDate }) {
  if (!zip || !targetDate) {
    return null;
  }

  if (config.weather.provider === "demo" || !config.weather.apiKey) {
    return createDemoForecast(zip, targetDate);
  }

  const response = await fetch(buildWeatherApiUrl(zip, countryCode, targetDate));
  if (!response.ok) {
    throw new Error(`Weather provider error: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const forecastDay = payload.forecast?.forecastday?.[0];
  if (!forecastDay) {
    return null;
  }

  return {
    provider: config.weather.provider,
    targetDate,
    maxTempF: forecastDay.day?.maxtemp_f ?? null,
    minTempF: forecastDay.day?.mintemp_f ?? null,
    condition: String(forecastDay.day?.condition?.text || "Unknown").trim()
  };
}
