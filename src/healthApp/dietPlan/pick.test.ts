import { describe, expect, it } from "vitest";

import { composeOptions } from "./compose.js";
import { pickDays } from "./pick.js";
import { defaultPrefs } from "./prefs.js";
import { DEFAULT_SHARES, macroTargets, mealBudgets } from "./targets.js";

const budgets = mealBudgets(macroTargets({ calories: 2100, proteinG: 150, weightKg: 80 }), DEFAULT_SHARES);
const options = Object.fromEntries(budgets.map((b) => [b.slot, composeOptions({ budget: b, diet: "vegetarian", avoid: [], loves: [], staples: "roti", prepLimit: null })]));

describe("the day's stored meals", () => {
  it("keeps a stored meal whose option left the plan, so no meal disappears from the day", () => {
    const totals = { kcal: 500, proteinG: 30, carbsG: 60, fatG: 15, fiberG: 8 };
    const existing = budgets.map((b, k) => (k === 0
      ? { date: "2026-11-04", slot: b.slot, optionId: options[b.slot]![0]!.id }
      : { date: "2026-11-04", slot: b.slot, optionId: "opt_old_000000000000", title: `Saved ${b.slot}`, totals, kind: "option" as const }));
    const out = pickDays({ start: "2026-11-04", days: 1, budgets, options, prefs: defaultPrefs(), existing });
    expect(out.map((p) => p.slot)).toEqual(budgets.map((b) => b.slot));
    const kept = out.find((p) => p.slot === budgets[1]!.slot)!;
    expect(kept).toMatchObject({ optionId: "opt_old_000000000000", title: `Saved ${budgets[1]!.slot}`, totals });
  });
});
