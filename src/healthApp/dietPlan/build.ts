/**
 * Builds a diet plan version from the person's targets and setup: meal budgets, 5 to 8 options
 * per meal, and (when switched on) the model review with one refill-and-recheck round.
 */
import { composeOptions, type MealOption, type PersonDiet } from "./compose.js";
import { prepLimit, shares, type DietPrefs } from "./prefs.js";
import { budgetsAfterSupplements, supplementLines } from "./supplements.js";
import type { PlanReview, ReviewIssue } from "./review.js";
import { macroTargets, mealBudgets, type MacroTargets, type MealBudget, type PlanSlot } from "./targets.js";

export type UsualForPlan = Array<{ key: string; text: string; slot: string; items: Array<{ name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number }> }>;

export type PlanDraft = {
  targets: MacroTargets;
  budgets: MealBudget[];
  options: Partial<Record<PlanSlot, MealOption[]>>;
  review: PlanReview | null;
};

export type ReviewFn = (meals: Array<{ budget: MealBudget; options: MealOption[] }>, personLine: string) => Promise<PlanReview | null>;

export async function buildPlanDraft(input: {
  calories: number;
  proteinG: number;
  weightKg: number | null;
  prefs: DietPrefs;
  diet: PersonDiet;
  avoid: string[];
  usual: UsualForPlan;
  hidden: string[];
  /** Given only when the review is switched on. */
  review?: ReviewFn;
}): Promise<PlanDraft> {
  const targets = macroTargets({ calories: input.calories, proteinG: input.proteinG, weightKg: input.weightKg });
  // Daily supplements come off the meal budgets; the day's targets stay whole.
  const budgets = budgetsAfterSupplements(mealBudgets(targets, shares(input.prefs)), supplementLines(input.prefs.supplements));
  const compose = (extraHidden: string[]) => {
    const out: Partial<Record<PlanSlot, MealOption[]>> = {};
    for (const b of budgets) {
      out[b.slot] = composeOptions({
        budget: b,
        diet: input.diet,
        avoid: input.avoid,
        loves: input.prefs.loves,
        staples: input.prefs.staples,
        prepLimit: prepLimit(input.prefs, b.slot),
        usual: input.usual.filter((u) => u.slot === b.slot),
        hidden: [...input.hidden, ...extraHidden],
      });
    }
    return out;
  };

  let options = compose([]);
  if (!input.review) return { targets, budgets, options, review: null };

  const personLine = personSummary(input);
  const meals = (o: typeof options) => budgets.map((b) => ({ budget: b, options: o[b.slot] ?? [] }));
  const first = await input.review(meals(options), personLine);
  if (!first || !first.issues.length) return { targets, budgets, options, review: first };

  // Drop what it flagged, refill, and check only the new options once.
  const dropped = first.issues.map((i) => i.optionId);
  const before = new Set(Object.values(options).flat().map((o) => o!.id));
  options = compose(dropped);
  const fresh = budgets
    .map((b) => ({ budget: b, options: (options[b.slot] ?? []).filter((o) => !before.has(o.id)) }))
    .filter((m) => m.options.length);
  let issues: ReviewIssue[] = first.issues;
  if (fresh.length) {
    const second = await input.review(fresh, personLine);
    if (second?.issues.length) {
      const bad = new Set(second.issues.map((i) => i.optionId));
      for (const b of budgets) options[b.slot] = (options[b.slot] ?? []).filter((o) => !bad.has(o.id));
      issues = [...issues, ...second.issues];
    }
  }
  return { targets, budgets, options, review: { ...first, issues } };
}

function personSummary(input: { diet: PersonDiet; avoid: string[]; prefs: DietPrefs }): string {
  const parts = [`diet ${input.diet ?? "not set"}`];
  if (input.avoid.length) parts.push(`avoids ${input.avoid.join(", ")}`);
  if (input.prefs.restrictions.length) parts.push(`restrictions: ${input.prefs.restrictions.join("; ")}`);
  parts.push(`staple ${input.prefs.staples}`);
  const supps = supplementLines(input.prefs.supplements);
  if (supps.length) parts.push(`takes daily: ${supps.map((s) => `${s.name} (${s.text})`).join(", ")}`);
  return parts.join("; ");
}
