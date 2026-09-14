/**
 * Strip optional verb users type after `/meal` (e.g. `/meal log 3 puri` → `3 puri`).
 */
export function stripLeadingMealLogVerb(text: string): string {
  const t = text.trim();
  const stripped = t.replace(/^log\s+/i, "").trim();
  return stripped.length >= 2 ? stripped : t;
}

/**
 * Split a free-text meal into user-intended components (comma / semicolon / " and ").
 * Used to label rows when the nutrition API returns one line per food.
 */
export function splitMealPhrases(raw: string): string[] {
  const t = raw.trim();
  if (!t) {
    return [];
  }

  const byDelim = t
    .split(/[,;]\s*/)
    .map((s) => s.replace(/^and\s+/i, "").trim())
    .filter((s) => s.length > 0);

  if (byDelim.length > 1) {
    return byDelim;
  }

  const one = byDelim[0] ?? t;
  const byAnd = one
    .split(/\s+and\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return byAnd.length > 1 ? byAnd : [one];
}
