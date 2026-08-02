/**
 * Resolve the public HTTPS base URL for OAuth callbacks and other hosted routes.
 * Independent of Telegram webhook mode — the health server is public on Railway even while polling.
 */
import type { EnvBag } from "../config/telegramRuntime.js";

function val(env: EnvBag, name: string): string | undefined {
  const v = env[name]?.trim();
  return v ? v : undefined;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export type PublicBaseUrl = { base: string; source: string };

export function resolvePublicBaseUrl(env: EnvBag = process.env): PublicBaseUrl | null {
  const explicit =
    val(env, "MAGNUS_PUBLIC_BASE_URL") ||
    val(env, "TELEGRAM_WEBHOOK_URL") ||
    undefined;
  if (explicit) {
    const base = stripTrailingSlash(explicit);
    if (!/^https:\/\//i.test(base)) {
      return null;
    }
    return {
      base,
      source: val(env, "MAGNUS_PUBLIC_BASE_URL")
        ? "MAGNUS_PUBLIC_BASE_URL"
        : "TELEGRAM_WEBHOOK_URL",
    };
  }

  const railway = val(env, "RAILWAY_PUBLIC_DOMAIN");
  if (railway) {
    return { base: `https://${stripTrailingSlash(railway)}`, source: "RAILWAY_PUBLIC_DOMAIN" };
  }

  const render = val(env, "RENDER_EXTERNAL_URL");
  if (render) {
    return { base: stripTrailingSlash(render), source: "RENDER_EXTERNAL_URL" };
  }

  const fly = val(env, "FLY_APP_NAME");
  if (fly) {
    return { base: `https://${fly}.fly.dev`, source: "FLY_APP_NAME" };
  }

  return null;
}

export const YOUTUBE_OAUTH_CALLBACK_PATH = "/oauth/youtube/callback";

export function youtubeOauthRedirectUri(env: EnvBag = process.env): string | null {
  const base = resolvePublicBaseUrl(env);
  if (!base) {
    return null;
  }
  return `${base.base}${YOUTUBE_OAUTH_CALLBACK_PATH}`;
}
