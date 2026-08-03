/**
 * In-chat Kite Connect OAuth: Magnus sends a login link; Zerodha redirects to the health
 * server; we exchange request_token for access_token and store it per user.
 *
 * App credentials (api key + secret) live in user_integrations per user — not on the host.
 * Kite access tokens expire daily (~6 AM IST) — user must reconnect after expiry.
 * https://kite.trade/docs/connect/v3/user/
 */
import { createHash, randomBytes } from "node:crypto";

import { kiteOauthRedirectUri } from "../../config/publicBaseUrl.js";
import { logger } from "../../logger.js";
import { exchangeKiteRequestToken } from "../../pillars/wealth/zerodha/kiteClient.js";
import {
  kiteAppCredentialsForUser,
  kiteLoginBaseUrl,
} from "../../pillars/wealth/zerodha/kiteEnv.js";
import { redis } from "../../tools/clients.js";
import { loggableError } from "../../util/loggableError.js";
import { upsertUserIntegrations } from "../../users/userIntegrations.js";

const STATE_TTL_SEC = 15 * 60;
const STATE_KEY_PREFIX = "magnus:kite_oauth:";

export type KiteOauthState = {
  userProfileId: string;
  telegramChatId: string;
  createdAt: string;
};

export async function kiteOauthLinkAvailableForUser(userProfileId: string): Promise<boolean> {
  const app = await kiteAppCredentialsForUser(userProfileId);
  return Boolean(app && kiteOauthRedirectUri());
}

export function kiteOauthRedirectConfigured(): string | null {
  return kiteOauthRedirectUri();
}

async function saveState(state: string, payload: KiteOauthState): Promise<void> {
  await redis.set(`${STATE_KEY_PREFIX}${state}`, JSON.stringify(payload), {
    ex: STATE_TTL_SEC,
  });
}

async function takeState(state: string): Promise<KiteOauthState | null> {
  const key = `${STATE_KEY_PREFIX}${state}`;
  const raw = await redis.get<string>(key);
  if (!raw) {
    return null;
  }
  await redis.del(key);
  try {
    return JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw)) as KiteOauthState;
  } catch {
    return null;
  }
}

function buildKiteLoginUrl(apiKey: string, state: string): string {
  const base = kiteLoginBaseUrl().replace(/\/$/, "");
  const redirectParams = encodeURIComponent(`state=${state}`);
  return `${base}/connect/login?v=3&api_key=${encodeURIComponent(apiKey)}&redirect_params=${redirectParams}`;
}

/**
 * Build a one-time Kite login URL. Redirect URI must match the app registered at developers.kite.trade.
 */
export async function beginKiteOauth(input: {
  userProfileId: string;
  telegramChatId: string;
}): Promise<{ ok: true; authUrl: string; redirectUri: string } | { ok: false; error: string }> {
  const app = await kiteAppCredentialsForUser(input.userProfileId);
  if (!app) {
    return {
      ok: false,
      error:
        "Your Kite Connect app is not configured yet. Add kite_api_key and kite_api_secret to user_integrations (see docs/ZERODHA.md — same pattern as Hevy: local .env + upsert-user-integrations.mts).",
    };
  }

  const redirectUri = kiteOauthRedirectUri();
  if (!redirectUri) {
    return {
      ok: false,
      error:
        "No public HTTPS URL for the OAuth callback. Set MAGNUS_PUBLIC_BASE_URL or deploy where RAILWAY_PUBLIC_DOMAIN exists.",
    };
  }

  const state = randomBytes(24).toString("hex");
  await saveState(state, {
    userProfileId: input.userProfileId,
    telegramChatId: input.telegramChatId,
    createdAt: new Date().toISOString(),
  });

  return {
    ok: true,
    authUrl: buildKiteLoginUrl(app.apiKey, state),
    redirectUri,
  };
}

export type KiteOauthCallbackResult =
  | { ok: true; userProfileId: string; telegramChatId: string; zerodhaUserId?: string }
  | { ok: false; error: string; userFacing: string };

/**
 * Exchange request_token from Kite redirect; store access_token for the user.
 */
export async function completeKiteOauth(input: {
  requestToken?: string | null;
  state?: string | null;
  status?: string | null;
  error?: string | null;
}): Promise<KiteOauthCallbackResult> {
  if (input.error) {
    return {
      ok: false,
      error: input.error,
      userFacing: `Zerodha returned an error: ${input.error}. Try asking Magnus to connect Zerodha again.`,
    };
  }

  if (input.status && input.status !== "success") {
    return {
      ok: false,
      error: `status_${input.status}`,
      userFacing: "Zerodha login did not complete. Try connecting again from Telegram.",
    };
  }

  const requestToken = input.requestToken?.trim();
  const state = input.state?.trim();
  if (!requestToken || !state) {
    return {
      ok: false,
      error: "missing_request_token_or_state",
      userFacing: "That link was incomplete. Ask Magnus to connect Zerodha again.",
    };
  }

  const payload = await takeState(state);
  if (!payload) {
    return {
      ok: false,
      error: "invalid_or_expired_state",
      userFacing:
        "That connect link expired or was already used. Ask Magnus to send a fresh Zerodha connect link.",
    };
  }

  const app = await kiteAppCredentialsForUser(payload.userProfileId);
  if (!app) {
    return {
      ok: false,
      error: "user_app_not_configured",
      userFacing:
        "Kite app credentials missing for this account. Run upsert-user-integrations with KITE_API_KEY and KITE_API_SECRET, then try again.",
    };
  }

  try {
    const exchanged = await exchangeKiteRequestToken({
      apiKey: app.apiKey,
      apiSecret: app.apiSecret,
      requestToken,
    });
    if (!exchanged.ok) {
      logger.warn(
        { err: exchanged.error, userProfileId: payload.userProfileId },
        "kite oauth token exchange failed",
      );
      return {
        ok: false,
        error: exchanged.error,
        userFacing:
          "Zerodha authorization failed. Confirm the redirect URI on your Kite app matches the host callback exactly, then try again.",
      };
    }

    const saved = await upsertUserIntegrations({
      userProfileId: payload.userProfileId,
      kiteAccessToken: exchanged.session.access_token,
      kiteUserId: exchanged.session.user_id,
      kiteTokenObtainedAt: new Date().toISOString(),
    });
    if (!saved.ok) {
      logger.error(
        { err: saved.error, userProfileId: payload.userProfileId },
        "kite oauth: failed to store access token",
      );
      return {
        ok: false,
        error: saved.error ?? "store_failed",
        userFacing: "Connected with Zerodha but I could not save the token. Try again in a minute.",
      };
    }

    logger.info(
      { userProfileId: payload.userProfileId, zerodhaUserId: exchanged.session.user_id },
      "kite oauth: stored access token for user",
    );

    return {
      ok: true,
      userProfileId: payload.userProfileId,
      telegramChatId: payload.telegramChatId,
      zerodhaUserId: exchanged.session.user_id,
    };
  } catch (e) {
    logger.warn({ err: loggableError(e) }, "kite oauth unexpected failure");
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      userFacing: "Zerodha authorization failed unexpectedly. Try again from Telegram.",
    };
  }
}

/** For tests — checksum helper matches Kite spec. */
export function kiteChecksum(apiKey: string, requestToken: string, apiSecret: string): string {
  return createHash("sha256").update(`${apiKey}${requestToken}${apiSecret}`).digest("hex");
}
