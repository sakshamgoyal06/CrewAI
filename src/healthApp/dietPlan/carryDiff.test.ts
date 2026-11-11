import { describe, expect, it, vi } from "vitest";

vi.mock("../../tools/clients.js", () => ({ supabase: {}, anthropic: {} }));

import { carryDiff } from "./carry.js";

describe("carryDiff", () => {
  it("5 Nov: removing the double-counted dinner turns a -200 x2 carry into none", () => {
    const old = [{ date: "2026-11-06", kcalDelta: -200 }, { date: "2026-11-07", kcalDelta: -200 }];
    expect(carryDiff(old, [])).toEqual([
      { date: "2026-11-06", from: -200, to: 0 },
      { date: "2026-11-07", from: -200, to: 0 },
    ]);
  });
  it("lists only the days whose number moved", () => {
    const old = [{ date: "2026-11-06", kcalDelta: -200 }, { date: "2026-11-07", kcalDelta: -200 }];
    const next = [{ date: "2026-11-06", kcalDelta: -100 }, { date: "2026-11-07", kcalDelta: -200 }];
    expect(carryDiff(old, next)).toEqual([{ date: "2026-11-06", from: -200, to: -100 }]);
    expect(carryDiff(old, old)).toEqual([]);
  });
});
