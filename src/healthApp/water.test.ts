import { describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {}, anthropic: {} }));

import { logWater, waterInput, waterTargetMl } from "./water.js";

const ctx = { userProfileId: "u1", timezone: "Asia/Kolkata", now: new Date("2026-11-04T06:00:00Z") };

function deps(total = 750) {
  const rows: unknown[] = [];
  return {
    rows,
    d: {
      insert: vi.fn(async (row: unknown) => { rows.push(row); return { error: null }; }),
      deleteLatest: vi.fn(async () => ({ error: null, deleted: true })),
      dayTotals: vi.fn(async (_u: string, from: string) => new Map([[from, total]])),
    },
  };
}

describe("waterTargetMl", () => {
  it("is about 35 ml/kg in 250 ml steps, within 2–4 L", () => {
    expect(waterTargetMl(null)).toBe(2500);
    expect(waterTargetMl(80)).toBe(2750);
    expect(waterTargetMl(45)).toBe(2000);
    expect(waterTargetMl(140)).toBe(4000);
  });
});

describe("logWater", () => {
  it("adds a glass for today and returns the day's total", async () => {
    const { d, rows } = deps(750);
    const r = await logWater(ctx, waterInput.parse({ ml: 250 }), "quick_add", d);
    expect(r).toEqual({ ok: true, date: "2026-11-04", totalMl: 750 });
    expect(rows[0]).toEqual({ user_profile_id: "u1", local_date: "2026-11-04", ml: 250, source: "quick_add" });
  });
  it("undo removes the latest log instead of inserting", async () => {
    const { d, rows } = deps(500);
    const r = await logWater(ctx, waterInput.parse({ undo: true }), "quick_add", d);
    expect(r).toMatchObject({ ok: true, totalMl: 500 });
    expect(d.deleteLatest).toHaveBeenCalledWith("u1", "2026-11-04");
    expect(rows).toHaveLength(0);
  });
  it("rejects future dates and empty input", async () => {
    const { d } = deps();
    expect(await logWater(ctx, waterInput.parse({ ml: 250, date: "2026-11-05" }), "chat", d)).toEqual({ ok: false, error: "future_date" });
    expect(waterInput.safeParse({}).success).toBe(false);
    expect(waterInput.safeParse({ ml: 0 }).success).toBe(false);
  });
  it("passes a save error through", async () => {
    const { d } = deps();
    d.insert.mockResolvedValueOnce({ error: "relation does not exist" });
    expect(await logWater(ctx, waterInput.parse({ ml: 250 }), "chat", d)).toEqual({ ok: false, error: "relation does not exist" });
  });
});
