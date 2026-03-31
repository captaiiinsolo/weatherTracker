import { config } from "../config.js";
import { extractBearerToken, verifySessionToken } from "./session-token.js";
import { getShopRecord, saveShopRecord } from "../services/shop-store.js";

async function exchangeForOfflineAccessToken({ shopDomain, sessionToken }) {
  const body = new URLSearchParams({
    client_id: config.shopify.apiKey,
    client_secret: config.shopify.apiSecret,
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    subject_token: sessionToken,
    subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
    requested_token_type: "urn:shopify:params:oauth:token-type:offline-access-token"
  });

  const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Shopify token exchange failed: ${JSON.stringify(payload)}`);
  }

  return payload;
}

export async function authenticateEmbeddedRequest(request) {
  const sessionToken = extractBearerToken(request.headers);
  if (!sessionToken) {
    return null;
  }

  const claims = verifySessionToken(sessionToken);
  let shopRecord = await getShopRecord(claims.shopDomain);

  if (!shopRecord?.offlineAccessToken && config.shopify.apiKey && config.shopify.apiSecret) {
    const tokenResponse = await exchangeForOfflineAccessToken({
      shopDomain: claims.shopDomain,
      sessionToken
    });

    shopRecord = await saveShopRecord({
      shopDomain: claims.shopDomain,
      offlineAccessToken: tokenResponse.access_token,
      scope: tokenResponse.scope || "",
      refreshToken: tokenResponse.refresh_token || "",
      expiresIn: tokenResponse.expires_in || null,
      refreshTokenExpiresIn: tokenResponse.refresh_token_expires_in || null
    });
  }

  return {
    shopDomain: claims.shopDomain,
    sessionToken,
    claims,
    shopRecord
  };
}
