import { splitMealPhrases } from "./mealPhrases.js";
import type { MealItemLine, MealNutritionEstimate } from "./types.js";

export type MealComponentForRow = {
  componentIndex: number;
  label: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  /** Single-item snapshot for `meal_logs.items` JSONB */
  itemsSnapshot: MealItemLine[];
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function pickComponentLabel(
  idx: number,
  item: MealItemLine,
  phrases: string[],
  itemCount: number,
): string {
  const phrase = phrases[idx]?.trim();
  const api = (item.name ?? "").trim();
  /** One free-text phrase but several parsed/API lines — labels come from each line (e.g. parser components). */
  const phraseAligned = phrases.length === itemCount;
  if (phraseAligned && phrase && phrase.length > 0) {
    return phrase;
  }
  if (api.length > 0) {
    return api;
  }
  if (phrase && phrase.length > 0) {
    return phrase;
  }
  return `Item ${idx + 1}`;
}

/** Meal parser pipeline stores `per_component` in providerRaw — keep one DB row per parsed component. */
function isParserPerComponentEstimate(estimate: MealNutritionEstimate): boolean {
  const r = estimate.providerRaw;
  return r !== null && typeof r === "object" && "per_component" in r;
}

/**
 * Turn an estimate into one row per component when the provider returns line items;
 * otherwise a single aggregate row. Distributes P/C/F by calorie share when needed.
 *
 * @param userDescription Normalized meal text (e.g. after stripping `/meal log` verb) — used for labels.
 */
export function buildMealComponentsFromEstimate(
  estimate: MealNutritionEstimate,
  userDescription: string,
): MealComponentForRow[] {
  const phrases = splitMealPhrases(userDescription);
  const items = estimate.items ?? [];
  const tc = estimate.calories;
  const tp = estimate.protein_g;
  const tcarb = estimate.carbs_g;
  const tf = estimate.fat_g;

  /**
   * Single user phrase + multi-item **legacy** CalorieNinjas response → one row (overlapping parts).
   * Parser pipeline uses one item per component; do not collapse those.
   */
  if (!isParserPerComponentEstimate(estimate) && items.length > 1 && phrases.length === 1) {
    const label =
      phrases[0]?.trim() || userDescription.trim() || "Meal";
    return [
      {
        componentIndex: 0,
        label: label.length > 0 ? label : "Meal",
        calories: tc,
        protein_g: tp,
        carbs_g: tcarb,
        fat_g: tf,
        itemsSnapshot: [...items],
      },
    ];
  }

  if (items.length === 0) {
    const label =
      phrases.length > 1
        ? phrases.join(", ")
        : phrases[0]?.trim() || userDescription.trim() || "Meal";
    return [
      {
        componentIndex: 0,
        label: label.length > 0 ? label : "Meal",
        calories: tc,
        protein_g: tp,
        carbs_g: tcarb,
        fat_g: tf,
        itemsSnapshot: [],
      },
    ];
  }

  if (items.length === 1) {
    const it = items[0]!;
    const combinedPhrase =
      phrases.length > 1 ? phrases.join(", ") : phrases[0]?.trim() ?? "";
    const label =
      combinedPhrase.length > 0
        ? combinedPhrase
        : (it.name ?? "").trim() || userDescription.trim() || "Meal";
    return [
      {
        componentIndex: 0,
        label,
        calories: it.calories ?? tc,
        protein_g: it.protein_g ?? tp,
        carbs_g: it.carbs_g ?? tcarb,
        fat_g: it.fat_g ?? tf,
        itemsSnapshot: [it],
      },
    ];
  }

  const calParts = items.map((i) => i.calories ?? 0);
  const sumCal = calParts.reduce((a, b) => a + b, 0);

  return items.map((it, idx) => {
    const w = sumCal > 0 ? (it.calories ?? 0) / sumCal : 1 / items.length;
    const calories = it.calories ?? (tc !== null ? round1(tc * w) : null);
    const protein_g =
      it.protein_g !== undefined
        ? it.protein_g
        : tp !== null
          ? round1(tp * w)
          : null;
    const carbs_g =
      it.carbs_g !== undefined
        ? it.carbs_g
        : tcarb !== null
          ? round1(tcarb * w)
          : null;
    const fat_g =
      it.fat_g !== undefined ? it.fat_g : tf !== null ? round1(tf * w) : null;

    return {
      componentIndex: idx,
      label: pickComponentLabel(idx, it, phrases, items.length),
      calories,
      protein_g,
      carbs_g,
      fat_g,
      itemsSnapshot: [it],
    };
  });
}
