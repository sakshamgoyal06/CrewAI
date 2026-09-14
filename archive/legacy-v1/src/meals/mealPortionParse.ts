/**
 * CalorieNinjas parses quantities like `3 tomatoes` or `1lb beef`; `30gm` is often missed.
 * Normalize common shorthands before calling the API.
 */
export function normalizeQueryForCalorieNinjas(query: string): string {
  return query
    .trim()
    .replace(/(\d+(?:\.\d+)?)\s*gm\b/gi, "$1g")
    .replace(/(\d+(?:\.\d+)?)\s*gram(s)?\b/gi, "$1g");
}

/** Leading `30g`, `30 gm`, `30gm`, `30 grams` on a phrase → grams, or null. */
export function extractLeadingGrams(phrase: string): number | null {
  const t = phrase.trim();
  const m = t.match(/^(\d+(?:\.\d+)?)\s*(?:g|gm|gram|grams)\b/i);
  if (!m) {
    return null;
  }
  const n = Number.parseFloat(m[1]!);
  return Number.isFinite(n) && n > 0 ? n : null;
}
