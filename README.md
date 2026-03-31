# Shopify Icepack Decision App

This repository contains a working v1 skeleton for a Shopify admin app that decides whether an order should get icepacks based on the forecasted destination temperature on the expected delivery date.

## What is included

- A lightweight Node server with webhook endpoints for:
  - `POST /webhooks/orders/create`
  - `POST /webhooks/orders/updated`
  - `POST /webhooks/fulfillments/update`
- A decision engine that:
  - checks for temperature-sensitive products
  - extracts carrier ETA when present
  - fetches weather by destination ZIP and arrival date
  - returns `ICEPACK_REQUIRED`, `NO_ICEPACK`, or `MANUAL_REVIEW`
  - computes idempotent Shopify tag add/remove actions
- A simple admin dashboard at `/` for:
  - setup status
  - threshold and tag settings
  - eligible product lists
  - recent cached orders
  - recent evaluation history
- JSON-backed local persistence under `data/` so the flow can be tested before wiring a production database
- Node built-in tests for the decision engine
- An embedded app foundation at `/embedded` that:
  - verifies Shopify session tokens
  - exchanges session tokens for offline access tokens
  - stores shop-level access tokens locally
  - lets the existing dashboard call the backend with App Bridge session auth

## Quick start

1. Copy [.env.example](/C:/Users/solod/Desktop/personalProjects/weatherTracker/.env.example) to `.env` and fill in Shopify and weather credentials.
2. Start the app:

```bash
node src/server.js
```

3. Open the app at `http://localhost:3000/`.

## Configuration notes

- If `WEATHER_API_KEY` is missing, the app falls back to a deterministic demo forecast so the dashboard and decision flow still work locally.
- Shopify tags are only written back when both `SHOPIFY_SHOP` and `SHOPIFY_ADMIN_ACCESS_TOKEN` are configured.
- Webhook HMAC validation is enforced whenever `SHOPIFY_WEBHOOK_SECRET` is set.
- Embedded app support requires `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET`.
- A sample Shopify CLI config is included in [shopify.app.template.toml](/C:/Users/solod/Desktop/personalProjects/weatherTracker/shopify.app.template.toml).

## Next production steps

- Replace the JSON store with a database for multi-user persistence and audit history.
- Replace the custom embedded shell with a full Shopify app template or Remix app if you want Shopify-managed boilerplate end to end.
- Expand ETA extraction if your carrier integration stores delivery dates in a custom location.
