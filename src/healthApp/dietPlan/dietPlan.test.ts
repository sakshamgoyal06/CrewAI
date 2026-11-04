import { describe, expect, it } from "vitest";

import { catalog } from "../../meals/catalog/index.js";
import { closeDay, rebalanceDay } from "./adjust.js";
import { buildPlanDraft } from "./build.js";
import { composeOptions, dietAllows, FIT_TOLERANCE, MAX_OPTIONS, MIN_OPTIONS, pairingProblems, type MealOption, type PersonDiet } from "./compose.js";
import { pickDays } from "./pick.js";
import { defaultPrefs, dietPrefsInput, prepLimit } from "./prefs.js";
import { parseReview, reviewInput } from "./review.js";
import { DEFAULT_SHARES, macroTargets, mealBudgets } from "./targets.js";

const T = macroTargets({ calories: 2100, proteinG: 150, weightKg: 80 });
const BUDGETS = mealBudgets(T, DEFAULT_SHARES);
const budget = (slot: string) => BUDGETS.find((b) => b.slot === slot)!;
const cat = catalog();
const keysOf = (o: MealOption) => o.items.map((i) => i.key!).filter(Boolean);

function compose(slot: string, diet: PersonDiet, extra: Partial<Parameters<typeof composeOptions>[0]> = {}) {
  return composeOptions({ budget: budget(slot), diet, avoid: [], loves: [], staples: "both", prepLimit: null, ...extra });
}

describe("targets", () => {
  it("splits the plan doc's worked example", () => {
    expect(T).toEqual({ calories: 2100, proteinG: 150, fatG: 65, carbsG: 229, fiberG: 29 });
  });

  it("keeps fat at 0.6 g/kg when 28% of calories is less", () => {
    expect(macroTargets({ calories: 1400, proteinG: 120, weightKg: 100 }).fatG).toBe(60);
  });

  it("rescales the shares of the meals they eat", () => {
    const b = mealBudgets(T, { breakfast: 25, lunch: 35, dinner: 30 });
    expect(b.map((x) => x.slot)).toEqual(["breakfast", "lunch", "dinner"]);
    expect(b.reduce((a, x) => a + x.calories, 0)).toBeGreaterThanOrEqual(2098);
    expect(b.find((x) => x.slot === "lunch")!.calories).toBe(817);
  });
});

describe("prefs", () => {
  it("lifts the cooking limit when someone else cooks, caps it for a basic kitchen", () => {
    const p = dietPrefsInput.parse({ ...defaultPrefs(), meals: [{ slot: "lunch", share: 50, cookMinutes: 10 }] });
    expect(prepLimit(p, "lunch")).toBe(10);
    expect(prepLimit({ ...p, whoCooks: "family" }, "lunch")).toBeNull();
    expect(prepLimit({ ...p, whoCooks: "family", kitchen: "basic" }, "lunch")).toBe(10);
    expect(prepLimit({ ...p, kitchen: "none" }, "lunch")).toBe(0);
  });
});

describe("composeOptions", () => {
  for (const diet of ["vegetarian", "eggetarian", "non_vegetarian", "jain"] as const) {
    for (const slot of ["breakfast", "lunch", "snack", "dinner"]) {
      it(`gives ${diet} ${slot} ${MIN_OPTIONS}–${MAX_OPTIONS} options that fit, follow the diet and pair well`, () => {
        const opts = compose(slot, diet);
        expect(opts.length).toBeGreaterThanOrEqual(diet === "jain" ? 4 : MIN_OPTIONS);
        expect(opts.length).toBeLessThanOrEqual(MAX_OPTIONS);
        expect(new Set(opts.map((o) => o.id)).size).toBe(opts.length);
        for (const o of opts) {
          expect(Math.abs(o.totals.kcal - budget(slot).calories) / budget(slot).calories).toBeLessThanOrEqual(FIT_TOLERANCE);
          for (const k of keysOf(o)) expect(dietAllows(diet, cat.byKey.get(k)!)).toBe(true);
          expect(pairingProblems(keysOf(o))).toEqual([]);
        }
      });
    }
  }

  it("never offers a vegetarian egg or meat", () => {
    const all = ["breakfast", "lunch", "snack", "dinner"].flatMap((s) => compose(s, "vegetarian"));
    expect(all.flatMap(keysOf).filter((k) => ["egg", "nonveg"].includes(cat.byKey.get(k)!.diet))).toEqual([]);
  });

  it("keeps the avoid list out, including dishes that contain it", () => {
    const all = ["breakfast", "lunch", "snack", "dinner"].flatMap((s) => compose(s, "vegetarian", { avoid: ["paneer", "peanuts"] }));
    const text = all.flatMap((o) => o.items.map((i) => i.name.toLowerCase())).join(" | ");
    expect(text).not.toMatch(/paneer|peanut|lemon rice/);
  });

  it("expands group words like dairy", () => {
    const all = ["breakfast", "snack"].flatMap((s) => compose(s, "vegetarian", { avoid: ["dairy"] }));
    expect(all.flatMap((o) => o.items.map((i) => i.key)).filter((k) => /curd|milk|yogurt|paneer|raita/.test(k ?? ""))).toEqual([]);
  });

  it("keeps root vegetables, onion and garlic out of a Jain plan", () => {
    const all = ["breakfast", "lunch", "dinner"].flatMap((s) => compose(s, "jain"));
    expect(all.flatMap(keysOf).filter((k) => /aloo|potato|onion/.test(k))).toEqual([]);
    expect(all.flatMap(keysOf)).not.toContain("dal tadka"); // has onion and garlic
  });

  it("respects the time they have to cook", () => {
    const opts = compose("lunch", "vegetarian", { prepLimit: 10 });
    for (const o of opts) expect(o.prepMinutes).toBeLessThanOrEqual(10);
  });

  it("puts a usual meal first, rescaled to the budget", () => {
    const usual = [{ key: "rajma chawal", text: "rajma chawal", items: [{ name: "Rajma chawal", calories: 640, protein_g: 20, carbs_g: 110, fat_g: 12 }] }];
    const opts = compose("lunch", "vegetarian", { usual });
    expect(opts[0]!.origin).toBe("usual");
    expect(opts[0]!.items[0]!.text).toBe("Rajma chawal (1¼× usual)");
  });

  it("leaves out a usual meal that pairs badly", () => {
    const usual = [{ key: "roti chilla", text: "roti and besan chilla", items: [{ name: "Roti", calories: 300, protein_g: 9, carbs_g: 60, fat_g: 2 }, { name: "Besan chilla", calories: 230, protein_g: 10, carbs_g: 25, fat_g: 9 }] }];
    expect(compose("breakfast", "vegetarian", { usual }).some((o) => o.origin === "usual")).toBe(false);
  });

  it("never offers a hidden option again", () => {
    const first = compose("dinner", "vegetarian");
    const again = compose("dinner", "vegetarian", { hidden: [first[0]!.id] });
    expect(again.map((o) => o.id)).not.toContain(first[0]!.id);
  });

  it("gives the same ids for the same meal, so marks survive a rebuild", () => {
    expect(compose("lunch", "non_vegetarian").map((o) => o.id)).toEqual(compose("lunch", "non_vegetarian").map((o) => o.id));
  });

  it("writes portions in household units", () => {
    const text = compose("lunch", "vegetarian").flatMap((o) => o.items.map((i) => i.text)).join(" | ");
    expect(text).toMatch(/\d medium roti|katori/);
    expect(text).not.toMatch(/,|undefined|NaN/);
  });
});

describe("pairingProblems", () => {
  it("flags roti with cheela, rice with a rice meal, and paneer twice", () => {
    expect(pairingProblems(["roti", "besan chilla"])).toHaveLength(1);
    expect(pairingProblems(["rajma chawal", "white rice cooked"])).toHaveLength(1);
    expect(pairingProblems(["roti", "palak paneer", "matar paneer"])).toHaveLength(1);
    expect(pairingProblems(["oat porridge", "sambar"])).not.toEqual([]);
  });

  it("passes a normal thali and a south Indian breakfast", () => {
    expect(pairingProblems(["roti", "dal tadka", "bhindi masala"])).toEqual([]);
    expect(pairingProblems(["idli", "sambar", "coconut chutney"])).toEqual([]);
  });
});

describe("pickDays", () => {
  const opts = (slot: string, n: number): MealOption[] =>
    Array.from({ length: n }, (_, i) => ({ id: `${slot}${i}`, slot: slot as MealOption["slot"], title: `${slot} ${i}`, items: [], totals: { kcal: 500, proteinG: 30, carbsG: 50, fatG: 15, fiberG: 5 }, origin: "catalog", prepMinutes: 10 }));
  const budgets = mealBudgets(T, { lunch: 50, dinner: 50 });
  const prefs = dietPrefsInput.parse({ meals: [{ slot: "lunch", share: 50 }, { slot: "dinner", share: 50 }] });

  it("doesn't repeat an option within 3 days", () => {
    const picks = pickDays({ start: "2026-11-04", budgets, options: { lunch: opts("lunch", 5), dinner: opts("dinner", 5) }, prefs });
    const lunches = picks.filter((p) => p.slot === "lunch").map((p) => p.optionId);
    expect(new Set(lunches).size).toBe(3);
  });

  it("picks a pinned option every day, keeps existing picks and plans eat-out meals as a budget", () => {
    const friday = dietPrefsInput.parse({ ...prefs, eatOut: [{ day: 5, slot: "dinner" }] }); // 2026-11-06 is a Friday
    const picks = pickDays({
      start: "2026-11-04",
      budgets,
      options: { lunch: opts("lunch", 5), dinner: opts("dinner", 5) },
      prefs: friday,
      pinned: ["lunch3"],
      existing: [{ date: "2026-11-04", slot: "dinner", optionId: "dinner4" }],
    });
    expect(picks.filter((p) => p.slot === "lunch").map((p) => p.optionId)).toEqual(["lunch3", "lunch3", "lunch3"]);
    expect(picks.find((p) => p.date === "2026-11-04" && p.slot === "dinner")!.optionId).toBe("dinner4");
    const fri = picks.find((p) => p.date === "2026-11-06" && p.slot === "dinner")!;
    expect(fri.kind).toBe("eat_out");
    expect(fri.title).toBe("Eating out, about 1050 kcal");
  });

  it("skips options eaten in the last two days", () => {
    const picks = pickDays({
      start: "2026-11-04",
      days: 1,
      budgets,
      options: { lunch: opts("lunch", 3), dinner: opts("dinner", 3) },
      prefs,
      existing: [{ date: "2026-11-03", slot: "lunch", optionId: "lunch0" }, { date: "2026-11-02", slot: "lunch", optionId: "lunch1" }],
    });
    expect(picks.find((p) => p.slot === "lunch")!.optionId).toBe("lunch2");
  });
});

describe("rebalanceDay", () => {
  it("trims roti at dinner after a heavy lunch, keeping the protein dish", () => {
    const dinner = compose("dinner", "vegetarian").find((o) => o.items.some((i) => i.key === "roti" && i.qty >= 3))!;
    const out = rebalanceDay({ target: T, budgets: BUDGETS, eaten: { kcal: 1750, proteinG: 90, carbsG: 200, fatG: 60, fiberG: 10 }, remaining: [dinner] });
    expect(out).toHaveLength(1);
    expect(out[0]!.totals.kcal).toBeLessThan(dinner.totals.kcal);
    expect(out[0]!.totals.kcal).toBeGreaterThanOrEqual(budget("dinner").calories * 0.6);
    // Only the roti moves; the dal or paneer dish stays as planned.
    const kept = (o: { items: MealOption["items"] }) => o.items.filter((i) => i.key !== "roti").map((i) => i.text);
    expect(kept(out[0]!)).toEqual(kept(dinner));
    expect(out[0]!.changes.join(" ")).toMatch(/roti instead of/);
  });

  it("leaves the day alone for a small difference", () => {
    const dinner = compose("dinner", "vegetarian")[0]!;
    expect(rebalanceDay({ target: T, budgets: BUDGETS, eaten: { kcal: 2100 - dinner.totals.kcal - 50, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 }, remaining: [dinner] })).toEqual([]);
  });
});

describe("closeDay", () => {
  const z = { proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };
  it("leaves an on-track day alone", () => {
    expect(closeDay({ date: "2026-11-04", target: T, eaten: { kcal: 2000, ...z }, floorKcal: 1500 }).carry).toEqual([]);
  });
  it("spreads half a big miss over two days, capped at 200", () => {
    const c = closeDay({ date: "2026-11-04", target: T, eaten: { kcal: 2700, ...z }, floorKcal: 1500 });
    expect(c.carry).toEqual([{ date: "2026-11-05", kcalDelta: -150 }, { date: "2026-11-06", kcalDelta: -150 }]);
    expect(closeDay({ date: "2026-11-04", target: T, eaten: { kcal: 3500, ...z }, floorKcal: 1500 }).carry[0]!.kcalDelta).toBe(-200);
  });
  it("never goes under the floor", () => {
    const low = macroTargets({ calories: 1550, proteinG: 110, weightKg: 70 });
    const c = closeDay({ date: "2026-11-04", target: low, eaten: { kcal: 2400, ...z }, floorKcal: 1500 });
    expect(c.carry.every((x) => 1550 + x.kcalDelta >= 1500)).toBe(true);
  });
});

describe("review", () => {
  it("keeps only issues about options it was shown", () => {
    expect(parseReview({ issues: [{ optionId: "a", kind: "pairing", problem: "x" }, { optionId: "zz", kind: "pairing", problem: "y" }] }, new Set(["a"]))).toEqual([
      { optionId: "a", kind: "pairing", problem: "x" },
    ]);
    expect(parseReview({ nope: 1 }, new Set())).toBeNull();
  });

  it("lists every option with its portions for the model", () => {
    const text = reviewInput([{ budget: budget("lunch"), options: compose("lunch", "vegetarian").slice(0, 2) }], "diet vegetarian");
    expect(text).toMatch(/lunch \(budget 735 kcal/);
    expect(text.split("\n").filter((l) => l.startsWith("- opt_lunch_"))).toHaveLength(2);
  });

  it("drops what the review flags and refills from the next best", async () => {
    let calls = 0;
    let flagged = "";
    const draft = await buildPlanDraft({
      calories: 2100,
      proteinG: 150,
      weightKg: 80,
      prefs: defaultPrefs(),
      diet: "vegetarian",
      avoid: [],
      usual: [],
      hidden: [],
      review: async (meals) => {
        calls++;
        if (calls > 1) return { model: "m", at: "t", issues: [] };
        flagged = meals.find((m) => m.budget.slot === "lunch")!.options[0]!.id;
        return { model: "m", at: "t", issues: [{ optionId: flagged, kind: "pairing", problem: "odd" }] };
      },
    });
    expect(calls).toBe(2);
    expect(draft.options.lunch!.map((o) => o.id)).not.toContain(flagged);
    expect(draft.options.lunch!.length).toBeGreaterThanOrEqual(MIN_OPTIONS);
    expect(draft.review!.issues).toHaveLength(1);
  });

  it("skips the model when the review is off", async () => {
    const draft = await buildPlanDraft({ calories: 2100, proteinG: 150, weightKg: 80, prefs: defaultPrefs(), diet: null, avoid: [], usual: [], hidden: [] });
    expect(draft.review).toBeNull();
    expect(Object.keys(draft.options)).toEqual(["breakfast", "lunch", "snack", "dinner"]);
  });
});
