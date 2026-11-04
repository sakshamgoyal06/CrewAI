import { describe, expect, it } from "vitest";

import { spreadCarry } from "./carry.js";
import { composeOptions } from "./compose.js";
import { dayCloseCard, dayCloseDue, dueMeals, rebalanceCard } from "./rhythm.js";
import { DEFAULT_SHARES, macroTargets, mealBudgets } from "./targets.js";

const BUDGETS = mealBudgets(macroTargets({ calories: 2100, proteinG: 150, weightKg: 80 }), DEFAULT_SHARES);
const option = (slot: "lunch" | "dinner") =>
  composeOptions({ budget: BUDGETS.find((b) => b.slot === slot)!, diet: "vegetarian", avoid: [], loves: [], staples: "roti", prepLimit: null })[0]!;
const item = { key: "roti", name: "Roti", servingId: "roti:piece", qty: 2, text: "2 rotis", grams: 80, kcal: 240, proteinG: 8, carbsG: 40, fatG: 4, fiberG: 4 };

describe("meal-time card", () => {
  const meal = (over: Record<string, unknown> = {}) => ({ status: "planned", kind: "option", time: "13:30", items: [item], ...over });
  it("is due from 10 minutes before the meal until an hour after", () => {
    const at = (h: number, m: number) => h * 60 + m;
    expect(dueMeals([meal()], at(13, 19))).toHaveLength(0);
    expect(dueMeals([meal()], at(13, 20))).toHaveLength(1);
    expect(dueMeals([meal()], at(14, 29))).toHaveLength(1);
    expect(dueMeals([meal()], at(14, 30))).toHaveLength(0);
  });
  it("skips meals already eaten, eat-out meals and meals with no time", () => {
    const now = 13 * 60 + 30;
    expect(dueMeals([meal({ status: "logged" }), meal({ kind: "eat_out" }), meal({ time: null }), meal({ items: [] })], now)).toHaveLength(0);
  });
});

describe("day close", () => {
  it("waits for 9:45 pm and an hour after the last planned meal", () => {
    expect(dayCloseDue(21 * 60 + 44, "20:30")).toBe(false);
    expect(dayCloseDue(21 * 60 + 45, "20:30")).toBe(true);
    expect(dayCloseDue(21 * 60 + 50, "21:30")).toBe(false);
    expect(dayCloseDue(22 * 60 + 30, "21:30")).toBe(true);
    // A very late dinner still closes before midnight.
    expect(dayCloseDue(23 * 60 + 30, "23:00")).toBe(true);
  });

  it("shows tomorrow's meals still to eat, with times", () => {
    const { text, card } = dayCloseCard({
      date: "2026-11-04",
      summary: "2,400 kcal of 2,100 kcal, 300 kcal over.",
      next: { date: "2026-11-05", meals: [
        { slot: "breakfast", time: "08:30", title: "Poha", kcal: 420, status: "planned" },
        { slot: "lunch", time: null, title: "Dal, roti", kcal: 700, status: "logged" },
      ] },
    });
    expect(card.next?.meals).toHaveLength(1);
    expect(text).toContain("Breakfast 8:30 am: Poha (420 kcal)");
    expect(text).not.toContain("Dal, roti");
  });
});

describe("carry-over", () => {
  it("makes the day lighter, spread over its meals, and keeps protein", () => {
    const meals = [option("lunch"), option("dinner")].map((o) => ({ slot: o.slot, items: o.items, totals: o.totals }));
    const before = meals.reduce((a, m) => a + m.totals.kcal, 0);
    const out = spreadCarry(meals, -150, BUDGETS);
    const after = out.reduce((a, m) => a + m.totals.kcal, 0);
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(before - 300);
    // Only carb bases move, so protein barely changes.
    const p = (xs: typeof meals) => xs.reduce((a, m) => a + m.totals.proteinG, 0);
    expect(p(out)).toBeGreaterThan(p(meals) * 0.85);
  });
  it("leaves the meals alone when there's nothing to carry", () => {
    const meals = [{ slot: "lunch" as const, items: [item], totals: { kcal: 240, proteinG: 8, carbsG: 40, fatG: 4, fiberG: 4 } }];
    expect(spreadCarry(meals, 0, BUDGETS)).toBe(meals);
  });
});

describe("rebalance card", () => {
  it("says where the day stands and what changed", () => {
    const { text, card } = rebalanceCard("2026-11-04", 1300, 2100, [{ slot: "dinner", changes: ["1 roti instead of 2 rotis"], kcal: 520 }]);
    expect(card.headline).toBe("1,300 of 2,100 kcal so far. I adjusted the rest of today so the day still lands.");
    expect(text).toContain("Dinner: 1 roti instead of 2 rotis (520 kcal)");
  });
});

describe("meal_plan chat tool", async () => {
  const { MEAL_PLAN_TOOL, mealPlanInput } = await import("./chatTool.js");
  it("takes the actions the description promises", () => {
    for (const action of ["view", "ate", "swap", "pin", "unpin", "like", "hide", "rebuild"]) {
      expect(mealPlanInput.safeParse({ action }).success).toBe(true);
      expect(MEAL_PLAN_TOOL.description).toContain(action);
    }
    expect(mealPlanInput.safeParse({ action: "ate", slot: "brunch" }).success).toBe(false);
    expect(mealPlanInput.safeParse({ action: "view", date: "tomorrow" }).success).toBe(false);
  });
});
