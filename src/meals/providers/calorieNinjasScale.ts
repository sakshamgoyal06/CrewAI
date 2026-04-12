import { logger } from "../../logger.js";
import { extractLeadingGrams } from "../mealPortionParse.js";
import { splitMealPhrases } from "../mealPhrases.js";

export type CnScaledLine = {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

type LineWithServing = CnScaledLine & { serving_size_g: number | null };

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

const MAX_SCALE_FACTOR = 50;

/**
 * CalorieNinjas returns calories/macros for each item's `serving_size_g` (default 100g if no qty parsed).
 * When the user specifies grams on a matching phrase, scale to that portion.
 *
 * If the user gave **one** portion phrase (e.g. `60g chickpea curry`) but the API returns **several**
 * line items, we scale **every** line by the same factor: `userGrams / sum(serving_size_g per line)`
 * so we do not leave trailing lines at full default servings (which massively inflated totals).
 */
export function scaleCalorieNinjaLinesByUserGrams(
  userQuery: string,
  lines: LineWithServing[],
): CnScaledLine[] {
  const phrases = splitMealPhrases(userQuery.trim());
  if (phrases.length === 0 || lines.length === 0) {
    return lines.map(({ serving_size_g: _s, ...rest }) => rest);
  }

  if (phrases.length === 1 && lines.length > 1) {
    const grams = extractLeadingGrams(phrases[0]!);
    if (grams != null) {
      const bundleRef = lines.reduce((sum, row) => {
        const sv =
          row.serving_size_g !== null &&
          row.serving_size_g !== undefined &&
          row.serving_size_g > 0
            ? row.serving_size_g
            : 100;
        return sum + sv;
      }, 0);
      let factor = grams / bundleRef;
      if (!Number.isFinite(factor) || factor <= 0) {
        return lines.map(stripServing);
      }
      if (factor > MAX_SCALE_FACTOR) {
        logger.warn(
          { grams, bundleRef, factor, line_count: lines.length },
          "calorieninjas bundle scale factor capped",
        );
        factor = MAX_SCALE_FACTOR;
      }
      if (factor !== 1) {
        logger.debug(
          { grams, bundleRef, factor, line_count: lines.length },
          "calorieninjas bundle scaled (single phrase, multi line)",
        );
      }
      return lines.map((row) => ({
        name: row.name,
        calories: round1(row.calories * factor),
        protein_g: round1(row.protein_g * factor),
        carbs_g: round1(row.carbs_g * factor),
        fat_g: round1(row.fat_g * factor),
      }));
    }
  }

  return lines.map((row, idx) => {
    const phrase =
      lines.length === phrases.length
        ? phrases[idx]!
        : lines.length === 1 && phrases.length === 1
          ? phrases[0]!
          : lines.length === 1
            ? ""
            : phrases[idx] ?? "";

    if (lines.length === 1 && phrases.length > 1) {
      return stripServing(row);
    }

    const grams = phrase ? extractLeadingGrams(phrase) : null;
    if (grams == null) {
      return stripServing(row);
    }

    let serving =
      row.serving_size_g !== null &&
      row.serving_size_g !== undefined &&
      row.serving_size_g > 0
        ? row.serving_size_g
        : null;
    let assumedDefault = false;
    if (serving == null) {
      serving = 100;
      assumedDefault = true;
    }

    let factor = grams / serving;
    if (!Number.isFinite(factor) || factor <= 0) {
      return stripServing(row);
    }
    if (factor > MAX_SCALE_FACTOR) {
      logger.warn(
        {
          name: row.name,
          grams,
          serving_size_g: serving,
          factor,
        },
        "calorieninjas scale factor capped",
      );
      factor = MAX_SCALE_FACTOR;
    }

    if (factor !== 1) {
      logger.debug(
        {
          name: row.name,
          grams,
          serving_size_g: serving,
          assumed_default_100g: assumedDefault,
          factor,
          calories_before: row.calories,
          calories_after: round1(row.calories * factor),
        },
        "calorieninjas scaled to user grams",
      );
    }

    return {
      name: row.name,
      calories: round1(row.calories * factor),
      protein_g: round1(row.protein_g * factor),
      carbs_g: round1(row.carbs_g * factor),
      fat_g: round1(row.fat_g * factor),
    };
  });
}

function stripServing(row: LineWithServing): CnScaledLine {
  const { serving_size_g: _s, ...rest } = row;
  return rest;
}
