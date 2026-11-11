import { describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {}, anthropic: {} }));

import { eatingOutPlan, ORDER_TIPS, planEatingOut, RESERVE_MAX, RESERVE_MIN } from "./eatingOut.js";

const base = { date: "2026-11-04", meal: "dinner" as const, calorieTarget: 2200, caloriesEaten: 600, proteinTarget: 140, proteinEaten: 40 };

describe("eatingOutPlan", () => {
  it("keeps ~45% of the target for the meal out and splits the rest", () => {
    const c = eatingOutPlan(base);
    expect(c.reserveKcal).toBe(1000);
    expect(c.beforeKcal).toBe(600);
    expect(c.proteinBeforeG).toBe(70);
    expect(c.lines[0]).toBe("Keep about 1000 kcal for dinner out.");
    expect(c.lines.join(" ")).toContain("70 g of protein");
    expect(c.tips.length).toBeGreaterThan(2);
  });
  it("caps the reserve between 700 and 1100 kcal", () => {
    expect(eatingOutPlan({ ...base, calorieTarget: 1400, caloriesEaten: 0 }).reserveKcal).toBe(RESERVE_MIN);
    expect(eatingOutPlan({ ...base, calorieTarget: 3400, caloriesEaten: 0 }).reserveKcal).toBe(RESERVE_MAX);
  });
  it("with little left, says order light instead of telling them to skip food", () => {
    const c = eatingOutPlan({ ...base, caloriesEaten: 1800 });
    expect(c.reserveKcal).toBe(400);
    expect(c.beforeKcal).toBe(0);
    expect(c.lines[0]).toMatch(/^About 400 kcal are left today/);
    expect(c.lines.join(" ")).not.toMatch(/skip (lunch|dinner|meals)/i);
  });
  it("when the day is already spent, says so plainly", () => {
    const c = eatingOutPlan({ ...base, caloriesEaten: 2500 });
    expect(c.reserveKcal).toBe(0);
    expect(c.lines[0]).toMatch(/already used/);
  });
  it("without targets, gives rules only", () => {
    const c = eatingOutPlan({ ...base, calorieTarget: null, proteinTarget: null });
    expect(c.reserveKcal).toBeNull();
    expect(c.proteinBeforeG).toBeNull();
    expect(c.lines[0]).toMatch(/Set a calorie target/);
  });
});

describe("planEatingOut", () => {
  it("builds from today's snapshot and records the turn when asked", async () => {
    const snapshot = vi.fn(async () => ({ targets: { calorieTarget: 2200, proteinTarget: 140 }, today: { calories: 600, proteinG: 40 } }) as never);
    const recordTurn = vi.fn(async () => undefined);
    const ctx = { userProfileId: "u1", timezone: "Asia/Kolkata", now: new Date("2026-11-04T08:00:00Z") };
    const r = await planEatingOut(ctx, { meal: "lunch" }, { record: true }, { snapshot, recordTurn });
    expect(r.card).toMatchObject({ type: "eating_out", meal: "lunch", date: "2026-11-04" });
    expect(r.text).toBe("Eating out at lunch: keep about 1000 kcal for it and 600 kcal for the rest of the day.");
    expect(recordTurn).toHaveBeenCalledWith("u1", "Eating out at lunch", r.text, [r.card]);
  });
});

describe("eating out for their diet", () => {
  const base = { date: "2026-11-06", meal: "dinner" as const, calorieTarget: 2200, caloriesEaten: 600, proteinTarget: 150, proteinEaten: 40 };
  it("a veg period: no eggs, chicken or tandoori meat in the advice", () => {
    const c = eatingOutPlan({ ...base, diet: "vegetarian" });
    const all = [...c.lines, ...c.tips].join(" ");
    expect(all).not.toMatch(/\beggs?\b|chicken/i);
    expect(c.tips[0]).toContain("Paneer or soya tikka");
    expect(c.lines.join(" ")).toContain("curd, dal, paneer, sprouts or a shake");
  });
  it("vegan: no dairy; and the avoid list drops a food", () => {
    const v = eatingOutPlan({ ...base, diet: "vegan" });
    expect([...v.lines, ...v.tips].join(" ")).not.toMatch(/paneer|curd|raita/i);
    const noPaneer = eatingOutPlan({ ...base, diet: "vegetarian", allows: (t) => !/paneer/i.test(t) });
    expect(noPaneer.lines.join(" ")).not.toMatch(/paneer/i);
  });
  it("no diet given keeps the usual advice", () => {
    expect(eatingOutPlan(base).tips[0]).toBe(ORDER_TIPS[0]);
  });
});
