/**
 * Prints sample diet plans for a set of personas, in the same text the model review reads.
 * Used to review plan quality by hand or in a Claude session (no API spend): `npx tsx scripts/dietPlanSample.ts`.
 */
import { buildPlanDraft } from "../src/healthApp/dietPlan/build.js";
import type { PersonDiet } from "../src/healthApp/dietPlan/compose.js";
import { defaultPrefs, dietPrefsInput, type DietPrefsInput } from "../src/healthApp/dietPlan/prefs.js";
import { reviewInput } from "../src/healthApp/dietPlan/review.js";

type Persona = { name: string; calories: number; proteinG: number; weightKg: number; diet: PersonDiet; avoid?: string[]; prefs?: Partial<DietPrefsInput> };

export const PERSONAS: Persona[] = [
  { name: "veg man cutting, cooks himself", calories: 2100, proteinG: 150, weightKg: 80, diet: "vegetarian" },
  { name: "nonveg man cutting, rice eater", calories: 2000, proteinG: 160, weightKg: 85, diet: "non_vegetarian", prefs: { staples: "rice" } },
  { name: "eggetarian woman, 1500 kcal, 10 min cooking", calories: 1500, proteinG: 100, weightKg: 62, diet: "eggetarian", prefs: { meals: [
    { slot: "breakfast", share: 25, cookMinutes: 10 }, { slot: "lunch", share: 35, cookMinutes: 10 }, { slot: "snack", share: 10, cookMinutes: 0 }, { slot: "dinner", share: 30, cookMinutes: 10 }] } },
  { name: "vegan, gluten-free", calories: 1800, proteinG: 110, weightKg: 70, diet: "vegan", avoid: ["gluten"] },
  { name: "jain, family cooks", calories: 1900, proteinG: 110, weightKg: 72, diet: "jain", prefs: { whoCooks: "family" } },
  { name: "veg, lactose-free, roti only", calories: 2200, proteinG: 130, weightKg: 78, diet: "vegetarian", avoid: ["lactose"], prefs: { staples: "roti" } },
  { name: "nonveg bulking, 3000 kcal", calories: 3000, proteinG: 170, weightKg: 75, diet: "non_vegetarian" },
  { name: "veg, no kitchen (hostel)", calories: 2000, proteinG: 120, weightKg: 70, diet: "vegetarian", prefs: { kitchen: "none" } },
];

async function main() {
  const summary: string[] = [];
  for (const p of PERSONAS) {
    const prefs = p.prefs ? dietPrefsInput.parse({ ...defaultPrefs(), ...p.prefs }) : defaultPrefs();
    const d = await buildPlanDraft({ calories: p.calories, proteinG: p.proteinG, weightKg: p.weightKg, prefs, rules: { diet: p.diet, avoid: p.avoid ?? [], dietNote: [], days: {} }, usual: [], hidden: [] });
    const meals = d.budgets.map((b) => ({ budget: b, options: d.options[b.slot] ?? [] }));
    console.log(`\n===== ${p.name} =====`);
    const prot = (f: (xs: number[]) => number) => Math.round(meals.reduce((a, m) => a + (m.options.length ? f(m.options.map((o) => o.totals.proteinG)) : 0), 0));
    const median = (xs: number[]) => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)]!;
    summary.push(`${p.name}: protein typical day ${prot(median)} g, best day ${prot((xs) => Math.max(...xs))} g, target ${p.proteinG} g; empty meals: ${meals.filter((m) => !m.options.length).map((m) => m.budget.slot).join(", ") || "none"}`);
    console.log(reviewInput(meals, `${p.name}; ${p.calories} kcal, ${p.proteinG} g protein`).replace(/- [0-9a-f]{8,}: /g, "- "));
  }
  console.log(`\n===== summary =====\n${summary.join("\n")}`);
}
void main();
