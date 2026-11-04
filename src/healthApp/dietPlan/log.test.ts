import { describe, expect, it } from "vitest";

import { qtyStep, setQty } from "./adjust.js";
import { composeOptions } from "./compose.js";
import { portioned } from "./log.js";
import { DEFAULT_SHARES, macroTargets, mealBudgets } from "./targets.js";

const lunch = () => {
  const b = mealBudgets(macroTargets({ calories: 2100, proteinG: 150, weightKg: 80 }), DEFAULT_SHARES).find((x) => x.slot === "lunch")!;
  return composeOptions({ budget: b, diet: "vegetarian", avoid: [], loves: [], staples: "roti", prepLimit: null })[0]!;
};

describe("eating a planned meal", () => {
  it("keeps the plan's items when portions don't change", () => {
    const o = lunch();
    expect(portioned(o.items, undefined)).toEqual(o.items);
    expect(portioned(o.items, o.items.map((i) => i.qty))).toEqual(o.items);
  });

  it("re-portions a changed item from the catalog and drops a skipped one", () => {
    const o = lunch();
    const bread = o.items.findIndex((i) => i.servingId?.includes(":piece"));
    expect(bread).toBeGreaterThanOrEqual(0);
    const qty = o.items.map((i) => i.qty);
    qty[bread] = qty[bread]! + 1;
    const last = qty.length - 1;
    if (last !== bread) qty[last] = 0;
    const out = portioned(o.items, qty);
    const roti = out.find((i) => i.key === o.items[bread]!.key)!;
    expect(roti.qty).toBe(o.items[bread]!.qty + 1);
    expect(roti.kcal).toBeGreaterThan(o.items[bread]!.kcal);
    expect(roti.text).toMatch(new RegExp(`^${o.items[bread]!.qty + 1} `));
    if (last !== bread) expect(out.length).toBe(o.items.length - 1);
  });

  it("steps pieces by 1 and katoris by a half", () => {
    const o = lunch();
    for (const i of o.items) {
      const unit = i.servingId?.split(":")[1];
      expect(qtyStep(i)).toBe(unit === "piece" || unit === "slice" ? 1 : unit ? 0.5 : 0.25);
    }
  });

  it("scales an item outside the catalog by its usual amount", () => {
    const i = { key: null, name: "Mom's khichdi", servingId: null, qty: 1, text: "Mom's khichdi", grams: null, kcal: 400, proteinG: 14, carbsG: 60, fatG: 10, fiberG: 4 };
    const half = setQty(i, 0.5);
    expect(half.kcal).toBe(200);
    expect(half.text).toBe("Mom's khichdi (0.5× usual)");
  });
});
