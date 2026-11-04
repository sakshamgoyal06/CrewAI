import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {}, anthropic: {} }));

import { _resetSpend, addSpend, priceOf, seedSpend, spendCaps, spendMode, turnCostUsd } from "./spend.js";

const U = "p1";
const D = "2026-11-04";

beforeEach(() => _resetSpend());

describe("spend caps", () => {
  it("prices a turn at the dearest model it used, with cache reads and writes", () => {
    expect(priceOf("claude-haiku-5-5")).toEqual({ input: 0.1, output: 0.5 });
    expect(priceOf("something-new")).toEqual({ input: 3, output: 15 });
    // 1M uncached input on Sonnet 5.5 = $2; 100k output = $1.
    expect(turnCostUsd(["claude-sonnet-5-5"], { input: 1_000_000, output: 100_000, cacheRead: 0, cacheWrite: 0 })).toBeCloseTo(3);
    expect(turnCostUsd(["claude-haiku-5-5", "claude-sonnet-5-5"], { input: 1_000_000 })).toBeCloseTo(2);
    expect(turnCostUsd(["claude-sonnet-5-5"], { cacheRead: 1_000_000, cacheWrite: 1_000_000 })).toBeCloseTo(0.2 + 2.5);
    expect(turnCostUsd([], { input: 5 })).toBe(0);
  });

  it("goes fast-only past the soft cap and blocks past the hard cap, per day", () => {
    expect(spendMode(U, D)).toBe("ok");
    addSpend(U, D, 1.2);
    expect(spendMode(U, D)).toBe("fast_only");
    addSpend(U, D, 2);
    expect(spendMode(U, D)).toBe("blocked");
    expect(spendMode(U, "2026-11-05")).toBe("ok");
  });

  it("starts the day from the log and never lowers a live total", () => {
    addSpend(U, D, 2);
    seedSpend(U, D, 0.5);
    expect(spendMode(U, D)).toBe("fast_only");
  });

  it("reads caps from env, 0 turning one off", () => {
    expect(spendCaps({} as NodeJS.ProcessEnv)).toEqual({ soft: 1, hard: 3 });
    const env = { MAGNUS_DAILY_SPEND_SOFT_USD: "0", MAGNUS_DAILY_SPEND_HARD_USD: "0" } as NodeJS.ProcessEnv;
    addSpend(U, D, 100);
    expect(spendMode(U, D, env)).toBe("ok");
  });
});
