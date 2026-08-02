/**
 * In-chat YouTube OAuth: Magnus sends a link; Google redirects to the health server;
 * we store the refresh token on user_integrations and ping the user on Telegram.
 */
import { randomBytes } from "node:crypto";

import { redis } from "../../tools/clients.js";
import { logger } from "../../logger.js";
import { loggableError } from "../../util/loggableError.js";
import { upsertUserIntegrations } from "../../users/userIntegrations.js";
import { youtubeOauthRedirectUri } from "../../config/publicBaseUrl.js";
import { createOAuth2Client, youtubePlatformConfigured } from "./auth.js";
import { GOOGLE_YOUTUBE_SCOPES } from "./paths.js";

const STATE_TTL_SEC = 15 * 60;
const STATE_KEY_PREFIX = "magnus:youtube_oauth:";

export type YoutubeOauthState = {
  userProfileId: string;
  telegramChatId: string;
  createdAt: string;
};

export function youtubeOauthLinkAvailable(): boolean {
  return youtubePlatformConfigured() && Boolean(youtubeOauthRedirectUri());
}

export function youtubeOauthRedirectConfigured(): string | null {
  return youtubeOauthRedirectUri();
}

async function saveState(state: string, payload: YoutubeOauthState): Promise<void> {
  await redis.set(`${STATE_KEY_PREFIX}${state}`, JSON.stringify(payload), {
    ex: STATE_TTL_SEC,
  });
}

async function takeState(state: string): Promise<YoutubeOauthState | null> {
  const key = `${STATE_KEY_PREFIX}${state}`;
  const raw = await redis.get<string>(key);
  if (!raw) {
    return null;
  }
  await redis.del(key);
  try {
    return JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw)) as YoutubeOauthState;
  } catch {
    return null;
  }
}

/**
 * Build a one-time Google consent URL for this Telegram user.
 * Requires a public HTTPS base (Railway / MAGNUS_PUBLIC_BASE_URL) and a Web OAuth client
 * with that redirect URI registered.
 */
export async function beginYoutubeOauth(input: {
  userProfileId: string;
  telegramChatId: string;
}): Promise<{ ok: true; authUrl: string; redirectUri: string } | { ok: false; error: string }> {
  if (!youtubePlatformConfigured()) {
    return {
      ok: false,
      error:
        "YouTube OAuth app is not on the host. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see docs/YOUTUBE.md).",
    };
  }
  const redirectUri = youtubeOauthRedirectUri();
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

  const client = createOAuth2Client(redirectUri);
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    scope: [...GOOGLE_YOUTUBE_SCOPES],
    prompt: "consent",
    state,
    include_granted_scopes: true,
  });

  return { ok: true, authUrl, redirectUri };
}

export type YoutubeOauthCallbackResult =
  | { ok: true; userProfileId: string; telegramChatId: string }
  | { ok: false; error: string; userFacing: string };

/**
 * Exchange the Google code, store youtube_refresh_token for the user in the state payload.
 */
export async function completeYoutubeOauth(input: {
  code?: string | null;
  state?: string | null;
  error?: string | null;
}): Promise<YoutubeOauthCallbackResult> {
  if (input.error) {
    return {
      ok: false,
      error: input.error,
      userFacing: `Google returned an error: ${input.error}. Try asking Magnus to connect YouTube again.`,
    };
  }
  const code = input.code?.trim();
  const state = input.state?.trim();
  if (!code || !state) {
    return {
      ok: false,
      error: "missing_code_or_state",
      userFacing: "That link was incomplete. Ask Magnus to connect YouTube again.",
    };
  }

  const payload = await takeState(state);
  if (!payload) {
    return {
      ok: false,
      error: "invalid_or_expired_state",
      userFacing:
        "That connect link expired or was already used. Ask Magnus to send a fresh YouTube link.",
    };
  }

  const redirectUri = youtubeOauthRedirectUri();
  if (!redirectUri) {
    return {
      ok: false,
      error: "no_redirect_uri",
      userFacing: "OAuth callback is misconfigured on the host. Check MAGNUS_PUBLIC_BASE_URL.",
    };
  }

  try {
    const client = createOAuth2Client(redirectUri);
    const { tokens } = await client.getToken(code);
    const refresh = tokens.refresh_token?.trim();
    if (!refresh) {
      logger.warn(
        { userProfileId: payload.userProfileId },
        "youtube oauth: no refresh_token — user may have already granted access",
      );
      return {
        ok: false,
        error: "no_refresh_token",
        userFacing:
          "Google did not return a refresh token (often when YouTube was linked before). Revoke Magnus at https://myaccount.google.com/permissions and ask me to connect again.",
      };
    }

    const saved = await upsertUserIntegrations({
      userProfileId: payload.userProfileId,
      youtubeRefreshToken: refresh,
    });
    if (!saved.ok) {
      logger.error(
        { err: saved.error, userProfileId: payload.userProfileId },
        "youtube oauth: failed to store refresh token",
      );
      return {
        ok: false,
        error: saved.error ?? "store_failed",
        userFacing: "Connected with Google but I could not save the token. Try again in a minute.",
      };
    }

    return {
    ok: true,
    userProfileId: payload.userProfileId,
    telegramChatId: payload.telegramChatId,
  };
  } catch (e) {
    logger.warn({ err: loggableError(e) }, "youtube oauth token exchange failed");
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      userFacing:
        "Google authorization failed. Make sure the OAuth client is a Web app with this redirect URI registered, then try again.",
    };
  }
}
