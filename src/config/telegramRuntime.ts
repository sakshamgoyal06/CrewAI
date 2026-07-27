/**
 * How this process receives Telegram updates.
 *
 * **Polling** (default) works anywhere, including a laptop behind NAT, but only one process may
 * poll a token — two instances mean `409 Conflict`, which is exactly what happens during a
 * rolling redeploy.
 *
 * **Webhook** (`MAGNUS_TELEGRAM_MODE=webhook`) has Telegram POST to the health server. Overlapping
 * deploys are harmless, Telegram retries delivery when the host blips, and the update dedupe in
 * `telegram.ts` keeps retries from replying twice. Recommended for an always-on host.
 *
 * The public URL is derived from the platform when possible (Railway, Render, Fly), so a hosted
 * deploy usually needs one variable rather than three.
 */
import { createHash } from "node:crypto";

export type EnvBag = Record<string, string | undefined>;

export type TelegramRuntimeMode = "polling" | "webhook";

export type TelegramWebhookConfig = {
  /** Registered with Telegram. */
  url: string;
  /** Route mounted on the health server. */
  path: string;
  /** Sent by Telegram as `X-Telegram-Bot-Api-Secret-Token`; rejects forged posts. */
  secretToken: string;
  /** Which variable supplied the public base URL, for logs and `telegram:check`. */
  source: string;
};

export type TelegramRuntimeConfig = {
  mode: TelegramRuntimeMode;
  webhook?: TelegramWebhookConfig;
  /** Human-readable explanation of the chosen mode — surfaced in logs and the setup CLI. */
  reason: string;
};

function val(env: EnvBag, name: string): string | undefined {
  const v = env[name]?.trim();
  return v ? v : undefined;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

type PublicBase = { base: string; source: string };

function publicBaseUrl(env: EnvBag): PublicBase | { error: string } | undefined {
  const explicit = val(env, "TELEGRAM_WEBHOOK_URL");
  if (explicit) {
    if (!/^https:\/\//i.test(explicit)) {
      return { error: "TELEGRAM_WEBHOOK_URL must start with https:// (Telegram refuses http)" };
    }
    return { base: stripTrailingSlash(explicit), source: "TELEGRAM_WEBHOOK_URL" };
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

  return undefined;
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Unguessable but stable across restarts, so a redeploy does not need a new `setWebhook`. */
export function webhookPathForToken(token: string): string {
  return `/telegram/${sha256Hex(token).slice(0, 32)}`;
}

/** Telegram allows `A-Z a-z 0-9 _ -`, 1–256 chars. */
export function webhookSecretForToken(env: EnvBag, token: string): string {
  return val(env, "TELEGRAM_WEBHOOK_SECRET") ?? sha256Hex(`${token}:magnus-webhook`);
}

export function resolveTelegramRuntime(env: EnvBag = process.env): TelegramRuntimeConfig {
  const token = val(env, "TELEGRAM_BOT_TOKEN") ?? "";
  const requested = val(env, "MAGNUS_TELEGRAM_MODE")?.toLowerCase();

  if (requested && requested !== "polling" && requested !== "webhook") {
    return {
      mode: "polling",
      reason: `MAGNUS_TELEGRAM_MODE=${requested} is not a mode (use polling or webhook) — polling`,
    };
  }

  const wantsWebhook = requested === "webhook" || Boolean(val(env, "TELEGRAM_WEBHOOK_URL"));
  if (!wantsWebhook) {
    return {
      mode: "polling",
      reason: "long polling (set MAGNUS_TELEGRAM_MODE=webhook on a host with a public URL)",
    };
  }

  const base = publicBaseUrl(env);
  if (base === undefined) {
    return {
      mode: "polling",
      reason:
        "webhook requested but no public URL found — set TELEGRAM_WEBHOOK_URL (or deploy where RAILWAY_PUBLIC_DOMAIN / RENDER_EXTERNAL_URL / FLY_APP_NAME exists); falling back to polling",
    };
  }
  if ("error" in base) {
    return { mode: "polling", reason: `${base.error}; falling back to polling` };
  }
  if (!token) {
    return {
      mode: "polling",
      reason: "webhook requested but TELEGRAM_BOT_TOKEN is missing",
    };
  }

  const path = webhookPathForToken(token);
  return {
    mode: "webhook",
    webhook: {
      url: `${base.base}${path}`,
      path,
      secretToken: webhookSecretForToken(env, token),
      source: base.source,
    },
    reason: `webhook via ${base.source}`,
  };
}

/** Redacts the unguessable path segment so the URL is safe to log. */
export function redactWebhookUrl(url: string): string {
  return url.replace(/\/telegram\/[a-f0-9]+$/i, "/telegram/***");
}
