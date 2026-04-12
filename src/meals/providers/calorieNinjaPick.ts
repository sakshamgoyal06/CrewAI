import { splitMealPhrases } from "../mealPhrases.js";

export type CnLineWithServing = {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  serving_size_g: number | null;
};

const STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "with",
  "of",
  "in",
  "on",
  "for",
  "to",
  "g",
  "gm",
  "gram",
  "grams",
  "cup",
  "cups",
  "tbsp",
  "tsp",
  "oz",
  "lb",
  "ml",
  "medium",
  "large",
  "small",
  "slice",
  "slices",
  "piece",
  "pieces",
  "fresh",
  "cooked",
  "raw",
  "diced",
  "chopped",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** Drop leading quantity so "250g chhole masala" matches item "chhole masala". */
function stripLeadingQuantityForMatch(query: string): string {
  return query
    .trim()
    .replace(/^(\d+(?:\.\d+)?)\s*(?:g|gm|gram|grams|ml|oz)\s+/i, "")
    .replace(/^(\d+(?:\.\d+)?)\s*(?:cup|cups|tbsp|tsp)\s+/i, "")
    .replace(/^(\d+(?:\.\d+)?)\s+/, "")
    .trim();
}

function meaningfulTokens(s: string): Set<string> {
  const out = new Set<string>();
  for (const t of tokenize(s)) {
    if (t.length < 2 || STOP.has(t) || /^\d+(\.\d+)?$/.test(t)) {
      continue;
    }
    out.add(t);
  }
  return out;
}

/** Higher = better match between user query (one dish) and API line name. */
export function calorieNinjaLineRelevanceScore(queryForMatch: string, itemName: string): number {
  const qt = meaningfulTokens(queryForMatch);
  const nt = meaningfulTokens(itemName);
  if (qt.size === 0) {
    return nt.size > 0 ? 0.05 : 0;
  }
  let inter = 0;
  for (const t of qt) {
    if (nt.has(t)) {
      inter++;
    }
  }
  const union = qt.size + nt.size - inter;
  const jacc = union === 0 ? 0 : inter / union;

  const qn = queryForMatch.toLowerCase().replace(/\s+/g, " ").trim();
  const nn = itemName.toLowerCase().replace(/\s+/g, " ").trim();
  let bonus = 0;
  if (nn.length > 0 && qn.length >= 4 && nn.includes(qn)) {
    bonus += 0.35;
  } else if (qn.length > 0 && nn.length >= 4 && qn.includes(nn)) {
    bonus += 0.25;
  }
  return jacc + bonus;
}

/**
 * When the user query is a **single** food phrase but CalorieNinjas returns several lines
 * (overlapping / alternate names), keep the line that best matches the query.
 * When the query lists multiple foods (comma / "and"), keep all lines for downstream scaling.
 */
export function narrowCalorieNinjaLinesToBestMatch(
  userQuery: string,
  lines: CnLineWithServing[],
): CnLineWithServing[] {
  if (lines.length <= 1) {
    return lines;
  }

  const phrases = splitMealPhrases(userQuery.trim());
  if (phrases.length !== 1) {
    return lines;
  }

  const queryCore = stripLeadingQuantityForMatch(phrases[0]!);
  const basis = queryCore.length > 0 ? queryCore : phrases[0]!;

  let bestIdx = 0;
  let bestScore = calorieNinjaLineRelevanceScore(basis, lines[0]!.name);

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    const s = calorieNinjaLineRelevanceScore(basis, line.name);
    if (s > bestScore) {
      bestScore = s;
      bestIdx = i;
      continue;
    }
    if (s === bestScore) {
      const prev = lines[bestIdx]!;
      if (line.name.length > prev.name.length) {
        bestIdx = i;
      } else if (line.name.length === prev.name.length && line.calories > prev.calories) {
        bestIdx = i;
      }
    }
  }

  return [lines[bestIdx]!];
}
