/**
 * Resolve the public HTTPS base URL for OAuth callbacks and other hosted routes.
 * Independent of Telegram webhook mode — the health server is public on Railway even while polling.
 */
import type { EnvBag } from "./telegramRuntime.js";

function val(env: EnvBag, name: string): string | undefined {
  const v = env[name]?.trim();
  return v ? v : undefined;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * OAuth redirect URIs must be origin + fixed path. If TELEGRAM_WEBHOOK_URL (or similar)
 * accidentally includes a path, keep only https://host[:port].
 */
export function httpsOrigin(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") {
      return null;
    }
    return stripTrailingSlash(u.origin);
  } catch {
    return null;
  }
}

export type PublicBaseUrl = { base: string; source: string };

export function resolvePublicBaseUrl(env: EnvBag = process.env): PublicBaseUrl | null {
  const explicit =
    val(env, "MAGNUS_PUBLIC_BASE_URL") ||
    val(env, "PUBLIC_BASE_URL") ||
    val(env, "TELEGRAM_WEBHOOK_URL") ||
    undefined;
  if (explicit) {
    const base = httpsOrigin(explicit);
    if (!base) {
      return null;
    }
    return {
      base,
      source: val(env, "MAGNUS_PUBLIC_BASE_URL")
        ? "MAGNUS_PUBLIC_BASE_URL"
        : val(env, "PUBLIC_BASE_URL")
          ? "PUBLIC_BASE_URL"
          : "TELEGRAM_WEBHOOK_URL",
    };
  }

  const railway = val(env, "RAILWAY_PUBLIC_DOMAIN");
  if (railway) {
    const host = stripTrailingSlash(railway.replace(/^https?:\/\//i, ""));
    const base = httpsOrigin(`https://${host}`);
    if (!base) {
      return null;
    }
    return { base, source: "RAILWAY_PUBLIC_DOMAIN" };
  }

  const render = val(env, "RENDER_EXTERNAL_URL");
  if (render) {
    const base = httpsOrigin(render);
    if (!base) {
      return null;
    }
    return { base, source: "RENDER_EXTERNAL_URL" };
  }

  const fly = val(env, "FLY_APP_NAME");
  if (fly) {
    return { base: `https://${fly}.fly.dev`, source: "FLY_APP_NAME" };
  }

  return null;
}

export const YOUTUBE_OAUTH_CALLBACK_PATH = "/oauth/youtube/callback";
/** Canonical in-chat Google OAuth callback (Calendar + YouTube). */
export const GOOGLE_OAUTH_CALLBACK_PATH = "/oauth/google/callback";
export const NOTION_OAUTH_CALLBACK_PATH = "/oauth/notion/callback";
/** Kite Connect OAuth callback (Zerodha login redirect). */
export const KITE_OAUTH_CALLBACK_PATH = "/oauth/kite/callback";

export function youtubeOauthRedirectUri(env: EnvBag = process.env): string | null {
  const base = resolvePublicBaseUrl(env);
  if (!base) {
    return null;
  }
  return `${base.base}${YOUTUBE_OAUTH_CALLBACK_PATH}`;
}

export function googleOauthRedirectUri(env: EnvBag = process.env): string | null {
  const base = resolvePublicBaseUrl(env);
  if (!base) {
    return null;
  }
  return `${base.base}${GOOGLE_OAUTH_CALLBACK_PATH}`;
}

export function notionOauthRedirectUri(env: EnvBag = process.env): string | null {
  const base = resolvePublicBaseUrl(env);
  if (!base) {
    return null;
  }
  return `${base.base}${NOTION_OAUTH_CALLBACK_PATH}`;
}

export function kiteOauthRedirectUri(env: EnvBag = process.env): string | null {
  const base = resolvePublicBaseUrl(env);
  if (!base) {
    return null;
  }
  return `${base.base}${KITE_OAUTH_CALLBACK_PATH}`;
}
