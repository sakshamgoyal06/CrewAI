/**
 * Magnus tool + wealth fast-path: connect Zerodha via Kite Connect OAuth.
 */
import { loadUserIntegrations } from "../../users/userIntegrations.js";
import {
  beginKiteOauth,
  kiteOauthLinkAvailable,
  kiteOauthRedirectConfigured,
} from "../../integrations/zerodha/oauthFlow.js";
import { kitePlatformReady } from "../../pillars/wealth/zerodha/kiteEnv.js";

const CONNECT_PATTERN =
  /\b(connect|link|login|sign in to|sign-in to)\b.*\b(zerodha|kite|coin)\b|\b(zerodha|kite)\b.*\b(connect|link)\b/i;

export function isKiteConnectRequest(message: string): boolean {
  return CONNECT_PATTERN.test(message.trim());
}

export async function connectKiteTool(input: {
  userProfileId: string;
  telegramUserId: string;
}): Promise<string> {
  const integrations = await loadUserIntegrations(input.userProfileId);

  if (integrations.kiteAccessToken) {
    const obtained = integrations.kiteTokenObtainedAt
      ? ` Token from ${integrations.kiteTokenObtainedAt.slice(0, 10)} — reconnect if expired (~6 AM IST daily).`
      : " Reconnect if data looks stale (tokens expire daily ~6 AM IST).";
    return (
      `Zerodha is already connected for this account${integrations.kiteUserId ? ` (${integrations.kiteUserId})` : ""}.` +
      `${obtained} Ask about holdings, SIPs, or net worth and I will pull live data.`
    );
  }

  if (!kitePlatformReady()) {
    return "Zerodha cannot be connected yet — the host is missing KITE_API_KEY / KITE_API_SECRET (from developers.kite.trade).";
  }

  if (!kiteOauthLinkAvailable()) {
    const redirect = kiteOauthRedirectConfigured();
    return (
      "I cannot build a Zerodha connect link without a public HTTPS URL for the callback. " +
      "Set MAGNUS_PUBLIC_BASE_URL (or deploy with RAILWAY_PUBLIC_DOMAIN). " +
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

  return [
    "Open this link to connect Zerodha (Kite + Coin) to Magnus (expires in about 15 minutes):",
    started.authUrl,
    "",
    "After you log in with Zerodha, I will save read-only portfolio access for your account and confirm here.",
    `Your Kite app redirect URI must be exactly: ${started.redirectUri}`,
    "",
    "Note: Kite access tokens expire daily (~6 AM IST). Say “connect Zerodha” again to refresh.",
  ].join("\n");
}

/** Alias for connect_kite / connect_zerodha tools. */
export async function connectZerodhaTool(input: {
  userProfileId: string;
  telegramUserId: string;
}): Promise<string> {
  return connectKiteTool(input);
}
