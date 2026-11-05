/**
 * Meal coherence, household familiarity, practical portions, honest day totals and swap
 * feedback: the rules from the planner fix, one household at a time.
 */
import { describe, expect, it } from "vitest";
import { catalog } from "../../meals/catalog/index.js";
import { buildPlanDraft } from "./build.js";
import { composeOptions, itemFor, pairingProblems, type ComposeInput, type MealOption } from "./compose.js";
import { accountDay, RECONCILE_TOLERANCE } from "./dayAccount.js";
import { proteinFrequencies, proteinGroupOf } from "./familiarity.js";
import { pickDays } from "./pick.js";
import { dishPrep, mealPrep } from "./prep.js";
import { defaultPrefs, dietPrefsInput } from "./prefs.js";
import { supplementLines } from "./supplements.js";
import type { MealBudget, PlanSlot } from "./targets.js";

const cat = catalog();
const entry = (k: string) => cat.byKey.get(k)!;
const budget = (slot: PlanSlot, calories = 650): MealBudget => ({ slot, calories, proteinG: 35, carbsG: 75, fatG: 20 }) as MealBudget;
const compose = (slot: PlanSlot, over: Partial<ComposeInput> = {}) =>
  composeOptions({ budget: budget(slot), diet: "non_vegetarian", avoid: [], loves: [], staples: "both", prepLimit: 30, ...over });
const groups = (opts: MealOption[]) => opts.map((o) => o.proteinGroup ?? null);
const text = (o: MealOption) => o.items.map((i) => i.text).join(" + ");

describe("households: what's allowed vs what's eaten", () => {
  it("non-veg by default plans chicken, egg, dal and paneer; mutton and seafood only under Try something new", () => {
    for (const slot of ["lunch", "dinner"] as const) {
      const opts = compose(slot);
      const everyday = opts.filter((o) => !o.novelty);
      expect(groups(everyday)).not.toContain("mutton");
      expect(groups(everyday)).not.toContain("seafood");
      expect(groups(everyday)).not.toContain("fish");
      expect(everyday.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("a fish-eating Bengali home gets fish in its everyday options", () => {
    const opts = compose("lunch", { habits: { proteins: { fish: "often" }, cuisines: ["east_indian"] } }).filter((o) => !o.novelty);
    expect(groups(opts)).toContain("fish");
  });

  it("chicken but rarely mutton: mutton never everyday, chicken is", () => {
    const opts = compose("dinner", { habits: { proteins: { chicken: "often", mutton: "rarely", seafood: "never" } } });
    const everyday = opts.filter((o) => !o.novelty);
    expect(groups(everyday)).toContain("chicken");
    expect(groups(everyday)).not.toContain("mutton");
    expect(groups(opts)).not.toContain("seafood");
  });

  it("a protein they never eat is gone, even from Try something new", () => {
    const opts = compose("lunch", { habits: { proteins: { egg: "never" } } });
    expect(groups(opts)).not.toContain("egg");
  });

  it("vegetarian households get dal and paneer meals, never meat", () => {
    const opts = compose("lunch", { diet: "vegetarian" });
    expect(opts.flatMap((o) => o.items).every((i) => !i.key || entry(i.key).diet === "veg" || entry(i.key).diet === "vegan")).toBe(true);
    expect(groups(opts.filter((o) => !o.novelty))).toEqual(expect.arrayContaining(["dal", "paneer"]));
  });

  it("loves and usual meals make a group everyday; explicit answers win", () => {
    const f = proteinFrequencies({ diet: "non_vegetarian", loves: ["prawn curry"] });
    expect(f.seafood).toBe("often");
    expect(f.mutton).toBe("rarely");
    expect(proteinFrequencies({ diet: "non_vegetarian", loves: ["prawn curry"], habits: { proteins: { seafood: "never" } } }).seafood).toBe("never");
  });

  it("names the protein group of a dish", () => {
    expect(proteinGroupOf(entry("rajma"))).toBe("dal");
    expect(proteinGroupOf({ key: "chicken keema", diet: "nonveg", category: "main" } as never)).toBe("chicken");
  });

  it("a dish they don't cook is never planned", () => {
    const first = compose("lunch").filter((o) => !o.novelty)[0]!;
    const main = first.items.find((i) => i.key && !/rice|roti|chapati/.test(i.key))!.key!;
    const again = compose("lunch", { habits: { neverCook: [main] } });
    expect(again.flatMap((o) => o.items.map((i) => i.key))).not.toContain(main);
  });
});

describe("meal coherence", () => {
  it("no two gravies; dal with a sabzi is still a normal thali", () => {
    expect(pairingProblems(["roti", "dal tadka", "bhindi masala"])).toEqual([]);
    expect(pairingProblems(["rice", "chicken curry", "dal makhani"]).join()).toMatch(/gravies/);
  });

  it("no doubled ingredient (pesarattu with moong sprouts)", () => {
    expect(pairingProblems(["pesarattu", "moong sprout"], cat).join()).toMatch(/both moong/);
  });

  it("every option planned passes the pairing rules, quick meals cook at most two dishes", () => {
    for (const slot of ["breakfast", "lunch", "dinner"] as const) {
      for (const o of compose(slot, { prepLimit: 20 })) {
        expect(pairingProblems(o.items.map((i) => i.key!).filter(Boolean))).toEqual([]);
        const cooked = o.items.filter((i) => i.key && i.key !== "green salad" && (entry(i.key).prepMinutes ?? 0) > 0);
        expect(cooked.length).toBeLessThanOrEqual(2);
      }
    }
  });
});

describe("practical portions and names", () => {
  it("whole eggs, whole rotis, grams for paneer; no doubled words", () => {
    for (const slot of ["breakfast", "lunch", "dinner", "snack"] as const) {
      for (const o of compose(slot)) {
        for (const i of o.items) {
          expect(i.text).not.toMatch(/\b(\w+) \1\b/);
          if (/\begg\b/.test(i.key ?? "") && /^\d/.test(i.text)) expect(Number.isInteger(parseFloat(i.text))).toBe(true);
          const m = i.text.match(/^(\d+(?:\.\d+)?) (?:small )?(roti|chapati|phulka|slice)/);
          if (m) expect(Number.isInteger(Number(m[1]))).toBe(true);
        }
      }
    }
  });

  it("seekh kebab reads once, counted", () => {
    const k = [...cat.byKey.keys()].find((x) => x.includes("seekh"));
    if (!k) return;
    const e = entry(k);
    const t = itemFor(e, e.servings[0]!, 2).text;
    expect(t).not.toMatch(/seekh seekh/);
  });

  it("scales a recipe portion linearly", () => {
    const e = entry("rajma");
    const one = itemFor(e, e.servings[0]!, 1);
    const half = itemFor(e, e.servings[0]!, 1.5);
    expect(half.kcal / one.kcal).toBeCloseTo(1.5, 1);
    expect(half.proteinG / one.proteinG).toBeCloseTo(1.5, 1);
  });

  it("options land in a range of the budget instead of all at the same number", () => {
    const kcal = compose("dinner").filter((o) => !o.novelty).map((o) => o.totals.kcal);
    expect(Math.max(...kcal) - Math.min(...kcal)).toBeGreaterThan(0);
    for (const k of kcal) expect(Math.abs(k - 650) / 650).toBeLessThanOrEqual(0.15);
  });
});

describe("prep time", () => {
  it("separates hands-on, total and what has to be ready", () => {
    const mutton = [...cat.byKey.values()].find((e) => /mutton curry|rogan josh/.test(e.key) && e.prepMinutes === 30);
    if (mutton) expect(dishPrep(mutton).total).toBeGreaterThan(dishPrep(mutton).active);
    const rice = dishPrep(entry("white rice cooked"));
    expect(rice).toMatchObject({ active: 5, total: 20 });
    const meal = mealPrep([entry("white rice cooked"), entry("dal tadka")]);
    expect(meal.totalMinutes).toBeGreaterThanOrEqual(meal.activeMinutes);
    expect(meal.totalMinutes).toBeLessThan(dishPrep(entry("white rice cooked")).total + dishPrep(entry("dal tadka")).total + 5);
  });
});

describe("day accounting", () => {
  const targets = { calories: 2232, proteinG: 165, carbsG: 230, fatG: 72 } as never;
  const whey = supplementLines([{ name: "Whey protein", servings: 1, slot: "breakfast" }]);
  const meal = (slot: PlanSlot, kcal: number, p: number, c: number, f: number) => ({ slot, kind: "option" as const, status: "planned", totals: { kcal, proteinG: p, carbsG: c, fatG: f, fiberG: 0 } });

  it("counts supplements exactly once and totals equal their parts", () => {
    const meals = [meal("breakfast", 450, 25, 55, 14), meal("lunch", 700, 40, 85, 20), meal("snack", 262, 12, 30, 10), meal("dinner", 700, 45, 70, 25)];
    const a = accountDay({ date: "2026-11-05", targets, meals, supplements: whey });
    expect(a.meals.kcal).toBe(2112);
    expect(a.supplements.kcal).toBe(Math.round(whey[0]!.kcal));
    expect(a.planned.kcal).toBe(a.meals.kcal + a.supplements.kcal);
    expect(a.planned.proteinG).toBeCloseTo(a.meals.proteinG + a.supplements.proteinG, 1);
    expect(a.unallocatedKcal).toBe(2232 - a.planned.kcal);
  });

  it("an eating-out meal is a calorie allowance with unknown macros", () => {
    const eatOut = { slot: "dinner" as const, kind: "eat_out" as const, status: "planned", totals: { kcal: 700, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 } };
    const a = accountDay({ date: "2026-11-05", targets, meals: [meal("lunch", 700, 40, 85, 20), eatOut], supplements: [] });
    expect(a.allowanceKcal).toBe(700);
    expect(a.planned.kcal).toBe(700);
    expect(a.planned.proteinG).toBe(40);
    expect(a.unallocatedKcal).toBe(2232 - 700 - 700);
    expect(a.proteinShortG).toBeGreaterThan(100);
  });

  it("uses what was eaten once a meal is logged", () => {
    const logged = { ...meal("lunch", 700, 40, 85, 20), status: "logged", eatenItems: [{ kcal: 500, proteinG: 30, carbsG: 60, fatG: 15, fiberG: 0 } as never] };
    const a = accountDay({ date: "2026-11-05", targets, meals: [logged], supplements: [] });
    expect(a.logged.kcal).toBe(500);
    expect(a.planned.kcal).toBe(500);
  });

  it("eaten today matches everything logged, so taken supplements count", () => {
    const logged = { kcal: 620, proteinG: 54, carbsG: 60, fatG: 15, meals: 2 }; // breakfast 500 + supplements 120
    const a = accountDay({ date: "2026-11-05", targets, meals: [{ ...meal("breakfast", 500, 30, 57, 14), status: "logged" }], supplements: whey, loggedActual: logged });
    expect(a.logged.kcal).toBe(620);
    expect(a.logged.proteinG).toBe(54);
    expect(a.planned.kcal).toBe(500 + Math.round(whey[0]!.kcal));
  });

  it("supplements are meal items: whey sits inside every breakfast option and the day adds up", async () => {
    const prefs = dietPrefsInput.parse({ ...defaultPrefs(), supplements: [{ name: "Whey protein", servings: 1, slot: null }] });
    const d = await buildPlanDraft({ calories: 2232, proteinG: 165, weightKg: 80, prefs, rules: { diet: "non_vegetarian", avoid: [], dietNote: [], days: {} }, usual: [], hidden: [] } as never);
    // Budgets are whole meals again; the supplement is inside one of them, not beside them.
    expect(Math.abs(d.budgets.reduce((a, b) => a + b.calories, 0) - 2232)).toBeLessThanOrEqual(5);
    for (const o of d.options.breakfast!) {
      const w = o.items.filter((i) => i.key === whey[0]!.key);
      expect(w).toHaveLength(1);
      expect(o.totals.kcal).toBe(Math.round(o.items.reduce((a, i) => a + i.kcal, 0)));
      expect(o.totals.proteinG).toBeCloseTo(o.items.reduce((a, i) => a + i.proteinG, 0), 0);
    }
    for (const slot of ["lunch", "snack", "dinner"] as const) for (const o of d.options[slot] ?? []) expect(o.items.some((i) => i.key === whey[0]!.key)).toBe(false);
    const picks = pickDays({ start: "2026-11-05", budgets: d.budgets, options: d.options, prefs });
    const day = picks.filter((p) => p.date === "2026-11-05").map((p) => ({ slot: p.slot, kind: p.kind, status: "planned", totals: p.totals }));
    const a = accountDay({ date: "2026-11-05", targets: d.targets, meals: day, supplements: [] });
    expect(a.supplements.kcal).toBe(0);
    expect(a.reconcile.diffPct).toBeLessThanOrEqual(RECONCILE_TOLERANCE);
    expect(a.target.kcal).toBe(2232);
  }, 30_000);
});

describe("swaps and feedback", () => {
  const prefs = dietPrefsInput.parse(defaultPrefs());
  const options = { lunch: compose("lunch") };
  const b = [budget("lunch")];

  it("never auto-picks a Try something new option", () => {
    const picks = pickDays({ start: "2026-11-05", days: 3, budgets: b, options, prefs });
    const novel = new Set(options.lunch.filter((o) => o.novelty).map((o) => o.id));
    expect(picks.some((p) => novel.has(p.optionId!))).toBe(false);
  });

  it("'unavailable today' skips the option that day only", () => {
    const first = pickDays({ start: "2026-11-05", days: 1, budgets: b, options, prefs })[0]!;
    const picks = pickDays({ start: "2026-11-05", days: 3, budgets: b, options, prefs, unavailable: [{ date: "2026-11-05", optionId: first.optionId! }] });
    expect(picks[0]!.optionId).not.toBe(first.optionId);
    // A different day can still have it.
    const later = pickDays({ start: "2026-11-08", days: 1, budgets: b, options, prefs, unavailable: [{ date: "2026-11-05", optionId: first.optionId! }] });
    expect(later[0]!.optionId).toBe(first.optionId);
  });

  it("an eating-out meal carries no invented macros", () => {
    const eatPrefs = dietPrefsInput.parse({ ...defaultPrefs(), eatOut: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, slot: "lunch" })) });
    const p = pickDays({ start: "2026-11-05", days: 1, budgets: b, options, prefs: eatPrefs })[0]!;
    expect(p.kind).toBe("eat_out");
    expect(p.totals).toMatchObject({ kcal: 650, proteinG: 0, carbsG: 0, fatG: 0 });
  });
});
