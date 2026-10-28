/**
 * Magnus tool + wealth fast-path: connect Zerodha via Kite Connect OAuth.
 * Multi-user: one Magnus Kite app on the host; each user gets their own access token.
 */
import { loadUserIntegrations } from "../../users/userIntegrations.js";
import {
  beginKiteOauth,
  kiteOauthLinkAvailableForUser,
  kiteOauthRedirectConfigured,
} from "../../integrations/zerodha/oauthFlow.js";
import { kiteAppCredentialsForUser } from "../../pillars/wealth/zerodha/kiteEnv.js";

const CONNECT_PATTERN =
  /\b(connect|link|login|sign in to|sign-in to|reconnect|refresh)\b.*\b(zerodha|kite|coin)\b|\b(zerodha|kite)\b.*\b(connect|link|reconnect)\b/i;

export function isKiteConnectRequest(message: string): boolean {
  return CONNECT_PATTERN.test(message.trim());
}

export async function connectKiteTool(input: {
  userProfileId: string;
  telegramUserId: string;
}): Promise<string> {
  const integrations = await loadUserIntegrations(input.userProfileId);
  const refreshing = Boolean(integrations.kiteAccessToken);

  const app = await kiteAppCredentialsForUser(input.userProfileId);
  if (!app) {
    return (
      "Zerodha is not available yet — the host is missing KITE_API_KEY and KITE_API_SECRET " +
      "(Magnus's single Kite Connect app on Railway). Users only need to log in with Zerodha; " +
      "they do not register as Kite developers. See docs/ZERODHA.md."
    );
  }

  if (!(await kiteOauthLinkAvailableForUser(input.userProfileId))) {
    const redirect = kiteOauthRedirectConfigured();
    return (
      "I cannot build a Zerodha connect link without a public HTTPS URL for the callback. " +
      "Set MAGNUS_PUBLIC_BASE_URL on the host (or deploy with RAILWAY_PUBLIC_DOMAIN). " +
      (redirect ? `Expected redirect: ${redirect}` : "")
    );
  }

  const started = await beginKiteOauth({
    userProfileId: input.userProfileId,
    telegramChatId: input.telegramUserId,
  });
  if (!started.ok) {
    return started.error;
  }

  const intro = refreshing
    ? "Open this link to refresh your Zerodha connection (Kite tokens expire daily ~6 AM IST):"
    : "Open this link to connect Zerodha (Kite + Coin) to Magnus (expires in about 15 minutes):";

  return [
    intro,
    started.authUrl,
    "",
    "After you log in with Zerodha, read-only portfolio access is saved for your account only.",
    `Redirect URI on the Magnus Kite app must be exactly: ${started.redirectUri}`,
    "",
    "Note: Say “connect Zerodha” any time to refresh after token expiry.",
  ].join("\n");
}

/** Alias for connect_kite / connect_zerodha tools. */
export async function connectZerodhaTool(input: {
  userProfileId: string;
  telegramUserId: string;
}): Promise<string> {
  return connectKiteTool(input);
}
