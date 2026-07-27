import { describe, expect, it } from "vitest";

import {
  redactWebhookUrl,
  resolveTelegramRuntime,
  webhookPathForToken,
  webhookSecretForToken,
  type EnvBag,
} from "./telegramRuntime.js";

const TOKEN = "123456:AAversion-of-a-token";
const BASE: EnvBag = { TELEGRAM_BOT_TOKEN: TOKEN };

describe("resolveTelegramRuntime", () => {
  it("defaults to polling", () => {
    const cfg = resolveTelegramRuntime(BASE);
    expect(cfg.mode).toBe("polling");
    expect(cfg.webhook).toBeUndefined();
  });

  it("derives the webhook URL from RAILWAY_PUBLIC_DOMAIN", () => {
    const cfg = resolveTelegramRuntime({
      ...BASE,
      MAGNUS_TELEGRAM_MODE: "webhook",
      RAILWAY_PUBLIC_DOMAIN: "magnus-production.up.railway.app",
    });
    expect(cfg.mode).toBe("webhook");
    expect(cfg.webhook?.source).toBe("RAILWAY_PUBLIC_DOMAIN");
    expect(cfg.webhook?.url).toBe(
      `https://magnus-production.up.railway.app${webhookPathForToken(TOKEN)}`,
    );
  });

  it("prefers an explicit TELEGRAM_WEBHOOK_URL and enables webhook mode on its own", () => {
    const cfg = resolveTelegramRuntime({
      ...BASE,
      TELEGRAM_WEBHOOK_URL: "https://magnus.example.com/",
      RAILWAY_PUBLIC_DOMAIN: "ignored.up.railway.app",
    });
    expect(cfg.mode).toBe("webhook");
    expect(cfg.webhook?.url.startsWith("https://magnus.example.com/telegram/")).toBe(true);
  });

  it("supports Render and Fly platform variables", () => {
    const render = resolveTelegramRuntime({
      ...BASE,
      MAGNUS_TELEGRAM_MODE: "webhook",
      RENDER_EXTERNAL_URL: "https://magnus.onrender.com",
    });
    expect(render.webhook?.source).toBe("RENDER_EXTERNAL_URL");

    const fly = resolveTelegramRuntime({
      ...BASE,
      MAGNUS_TELEGRAM_MODE: "webhook",
      FLY_APP_NAME: "magnus",
    });
    expect(fly.webhook?.url.startsWith("https://magnus.fly.dev/telegram/")).toBe(true);
  });

  it("falls back to polling, with a reason, when webhook cannot be configured", () => {
    const noUrl = resolveTelegramRuntime({ ...BASE, MAGNUS_TELEGRAM_MODE: "webhook" });
    expect(noUrl.mode).toBe("polling");
    expect(noUrl.reason).toContain("no public URL");

    const insecure = resolveTelegramRuntime({
      ...BASE,
      TELEGRAM_WEBHOOK_URL: "http://magnus.example.com",
    });
    expect(insecure.mode).toBe("polling");
    expect(insecure.reason).toContain("https");

    const typo = resolveTelegramRuntime({ ...BASE, MAGNUS_TELEGRAM_MODE: "webhooks" });
    expect(typo.mode).toBe("polling");
    expect(typo.reason).toContain("not a mode");
  });
});

describe("webhook path and secret", () => {
  it("are stable for a token and differ between tokens", () => {
    expect(webhookPathForToken(TOKEN)).toBe(webhookPathForToken(TOKEN));
    expect(webhookPathForToken(TOKEN)).not.toBe(webhookPathForToken(`${TOKEN}x`));
    expect(webhookPathForToken(TOKEN)).toMatch(/^\/telegram\/[a-f0-9]{32}$/);
  });

  it("derive a secret when none is configured, and honour an explicit one", () => {
    expect(webhookSecretForToken({}, TOKEN)).toMatch(/^[a-f0-9]{64}$/);
    expect(webhookSecretForToken({ TELEGRAM_WEBHOOK_SECRET: "s3cret" }, TOKEN)).toBe("s3cret");
  });
});

describe("redactWebhookUrl", () => {
  it("hides the path segment", () => {
    expect(redactWebhookUrl(`https://x.up.railway.app${webhookPathForToken(TOKEN)}`)).toBe(
      "https://x.up.railway.app/telegram/***",
    );
  });
});
