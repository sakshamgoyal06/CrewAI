/**
 * In-chat Google OAuth: one consent for Calendar + YouTube.
 * Magnus sends a link; Google redirects to the health server; we store the refresh
 * token on both google_* columns in user_integrations and confirm on Telegram.
 */
import { randomBytes } from "node:crypto";

import { googleOauthRedirectUri } from "../../config/publicBaseUrl.js";
import { logger } from "../../logger.js";
import { redis } from "../../tools/clients.js";
import { loggableError } from "../../util/loggableError.js";
import { upsertUserIntegrations } from "../../users/userIntegrations.js";
import { createOAuth2Client } from "../youtube/auth.js";
import { GOOGLE_UNIFIED_SCOPES } from "./scopes.js";

const STATE_TTL_SEC = 15 * 60;
const STATE_KEY_PREFIX = "magnus:google_oauth:";

export type GoogleOauthState = {
  userProfileId: string;
  telegramChatId: string;
  createdAt: string;
};

function platformGoogleOAuthReady(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}

export function googleOauthLinkAvailable(): boolean {
  return platformGoogleOAuthReady() && Boolean(googleOauthRedirectUri());
}

export function googleOauthRedirectConfigured(): string | null {
  return googleOauthRedirectUri();
}

async function saveState(state: string, payload: GoogleOauthState): Promise<void> {
  await redis.set(`${STATE_KEY_PREFIX}${state}`, JSON.stringify(payload), {
    ex: STATE_TTL_SEC,
  });
}

async function takeState(state: string): Promise<GoogleOauthState | null> {
  const key = `${STATE_KEY_PREFIX}${state}`;
  const raw = await redis.get<string>(key);
  if (!raw) {
    return null;
  }
  await redis.del(key);
  try {
    return JSON.parse(typeof raw === "string" ? raw : JSON.stringify(raw)) as GoogleOauthState;
  } catch {
    return null;
  }
}

/**
 * Build a one-time Google consent URL (Calendar + YouTube scopes).
 * Requires a public HTTPS base and a Web OAuth client with that redirect URI registered.
 */
export async function beginGoogleOauth(input: {
  userProfileId: string;
  telegramChatId: string;
}): Promise<{ ok: true; authUrl: string; redirectUri: string } | { ok: false; error: string }> {
  if (!platformGoogleOAuthReady()) {
    return {
      ok: false,
      error:
        "Google OAuth is not on the host. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on a Web application client (see docs/YOUTUBE.md).",
    };
  }
  const redirectUri = googleOauthRedirectUri();
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
    scope: [...GOOGLE_UNIFIED_SCOPES],
    prompt: "consent",
    state,
    include_granted_scopes: true,
  });

  return { ok: true, authUrl, redirectUri };
}

export type GoogleOauthCallbackResult =
  | { ok: true; userProfileId: string; telegramChatId: string }
  | { ok: false; error: string; userFacing: string };

/**
 * Exchange the Google code; store the same refresh token for Calendar and YouTube.
 */
export async function completeGoogleOauth(input: {
  code?: string | null;
  state?: string | null;
  error?: string | null;
}): Promise<GoogleOauthCallbackResult> {
  if (input.error) {
    return {
      ok: false,
      error: input.error,
      userFacing: `Google returned an error: ${input.error}. Try asking Magnus to connect Google again.`,
    };
  }
  const code = input.code?.trim();
  const state = input.state?.trim();
  if (!code || !state) {
    return {
      ok: false,
      error: "missing_code_or_state",
      userFacing: "That link was incomplete. Ask Magnus to connect Google again.",
    };
  }

  const payload = await takeState(state);
  if (!payload) {
    return {
      ok: false,
      error: "invalid_or_expired_state",
      userFacing:
        "That connect link expired or was already used. Ask Magnus to send a fresh Google connect link.",
    };
  }

  const redirectUri = googleOauthRedirectUri();
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
        "google oauth: no refresh_token — user may have already granted access",
      );
      return {
        ok: false,
        error: "no_refresh_token",
        userFacing:
          "Google did not return a refresh token (often when access was granted before). Revoke Magnus at https://myaccount.google.com/permissions and ask me to connect Google again.",
      };
    }

    // Same refresh token authorizes both APIs when scopes were requested together.
    const saved = await upsertUserIntegrations({
      userProfileId: payload.userProfileId,
      googleCalendarRefreshToken: refresh,
      googleYoutubeRefreshToken: refresh,
    });
    if (!saved.ok) {
      logger.error(
        { err: saved.error, userProfileId: payload.userProfileId },
        "google oauth: failed to store refresh token",
      );
      return {
        ok: false,
        error: saved.error ?? "store_failed",
        userFacing: "Connected with Google but I could not save the token. Try again in a minute.",
      };
    }

    logger.info(
      { userProfileId: payload.userProfileId },
      "google oauth: stored calendar + youtube refresh token for user",
    );

    return {
      ok: true,
      userProfileId: payload.userProfileId,
      telegramChatId: payload.telegramChatId,
    };
  } catch (e) {
    logger.warn({ err: loggableError(e) }, "google oauth token exchange failed");
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      userFacing:
        "Google authorization failed. Use a Web application OAuth client with this redirect URI registered, then try again.",
    };
  }
}
