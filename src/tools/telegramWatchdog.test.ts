import { describe, expect, it, vi } from "vitest";

import {
  runWatchdogProbe,
  shouldRestart,
  watchdogFailureThreshold,
  watchdogIntervalMs,
  webhookDrifted,
  type WatchdogDeps,
  type WatchdogState,
} from "./telegramWatchdog.js";

const FRESH: WatchdogState = { consecutiveFailures: 0, lastOkAt: null };

function deps(overrides: Partial<WatchdogDeps> = {}): WatchdogDeps {
  return {
    getMe: async () => ({ ok: true }),
    onFatal: () => {
      throw new Error("onFatal should not fire");
    },
    intervalMs: 60_000,
    failureThreshold: 3,
    ...overrides,
  };
}

describe("watchdog configuration", () => {
  it("defaults to a 60s interval and 5 failures, and allows disabling", () => {
    expect(watchdogIntervalMs({})).toBe(60_000);
    expect(watchdogIntervalMs({ MAGNUS_TELEGRAM_WATCHDOG_INTERVAL_MS: "0" })).toBe(0);
    expect(watchdogIntervalMs({ MAGNUS_TELEGRAM_WATCHDOG_INTERVAL_MS: "nonsense" })).toBe(60_000);
    expect(watchdogFailureThreshold({})).toBe(5);
    expect(watchdogFailureThreshold({ MAGNUS_TELEGRAM_WATCHDOG_FAILURES: "2" })).toBe(2);
  });
});

describe("runWatchdogProbe", () => {
  it("resets the failure count after a successful probe", async () => {
    const next = await runWatchdogProbe(deps(), { consecutiveFailures: 2, lastOkAt: null });
    expect(next.consecutiveFailures).toBe(0);
    expect(next.lastOkAt).toBeTypeOf("number");
  });

  it("counts failures without restarting below the threshold", async () => {
    const onFatal = vi.fn();
    const failing = deps({
      getMe: async () => {
        throw new Error("ETIMEDOUT");
      },
      onFatal,
    });
    const first = await runWatchdogProbe(failing, FRESH);
    expect(first.consecutiveFailures).toBe(1);
    expect(onFatal).not.toHaveBeenCalled();
  });

  it("asks for a restart once the threshold is reached", async () => {
    const onFatal = vi.fn();
    const failing = deps({
      getMe: async () => {
        throw new Error("ETIMEDOUT");
      },
      onFatal,
      failureThreshold: 2,
    });
    const state = await runWatchdogProbe(failing, { consecutiveFailures: 1, lastOkAt: null });
    expect(state.consecutiveFailures).toBe(2);
    expect(onFatal).toHaveBeenCalledOnce();
  });

  it("re-registers a drifted webhook and leaves a matching one alone", async () => {
    const repairWebhook = vi.fn(async () => {});
    await runWatchdogProbe(
      deps({
        getWebhookUrl: async () => "",
        expectedWebhookUrl: "https://magnus.example.com/telegram/abc",
        repairWebhook,
      }),
      FRESH,
    );
    expect(repairWebhook).toHaveBeenCalledOnce();

    repairWebhook.mockClear();
    await runWatchdogProbe(
      deps({
        getWebhookUrl: async () => "https://magnus.example.com/telegram/abc/",
        expectedWebhookUrl: "https://magnus.example.com/telegram/abc",
        repairWebhook,
      }),
      FRESH,
    );
    expect(repairWebhook).not.toHaveBeenCalled();
  });

  it("treats a failed webhook check as non-fatal", async () => {
    const onFatal = vi.fn();
    const state = await runWatchdogProbe(
      deps({
        getWebhookUrl: async () => {
          throw new Error("api down");
        },
        expectedWebhookUrl: "https://magnus.example.com/telegram/abc",
        repairWebhook: async () => {},
        onFatal,
      }),
      FRESH,
    );
    expect(onFatal).not.toHaveBeenCalled();
    expect(state.consecutiveFailures).toBe(0);
  });
});

describe("helpers", () => {
  it("shouldRestart compares against the threshold", () => {
    expect(shouldRestart({ consecutiveFailures: 4, lastOkAt: null }, 5)).toBe(false);
    expect(shouldRestart({ consecutiveFailures: 5, lastOkAt: null }, 5)).toBe(true);
  });

  it("webhookDrifted ignores trailing slashes", () => {
    expect(webhookDrifted("https://a/b/", "https://a/b")).toBe(false);
    expect(webhookDrifted("https://a/c", "https://a/b")).toBe(true);
  });
});
