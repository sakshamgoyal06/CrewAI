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

const SLOT_WORDS: Record<string, "breakfast" | "lunch" | "dinner" | "snack"> = {
  breakfast: "breakfast",
  nashta: "breakfast",
  lunch: "lunch",
  dinner: "dinner",
  supper: "dinner",
  snack: "snack",
  snacks: "snack",
};

/**
 * Takes the words around the food out of a typed meal: "I had poha for breakfast" → "poha", slot
 * breakfast; "dal rice at lunch today" → "dal rice", slot lunch. The food parser only knows food
 * names, so without this "poha for breakfast" finds nothing.
 */
export function mealContext(raw: string): { text: string; slot?: "breakfast" | "lunch" | "dinner" | "snack"; extra?: true; yesterday?: true } {
  let t = raw.trim();
  const yesterday = /\b(?:yesterday|last\s+night)\b/i.test(t);
  let slot: "breakfast" | "lunch" | "dinner" | "snack" | undefined;
  // "Add a tea in today's breakfast", "also had a banana", "an extra roti": on top of the meal.
  const extra = /^\s*(?:please\s+)?(?:add|also|plus)\b|\b(?:extra|on\s+top|as\s+well|also\s+had)\b/i.test(t);
  const slotRe = /\b(?:for|at|in|during|as|to|with)\s+(?:my\s+|a\s+|the\s+|today'?s\s+|tonight'?s\s+|this\s+morning'?s\s+)?(breakfast|nashta|lunch|dinner|supper|snacks?)\b/i;
  const m = slotRe.exec(t);
  if (m) {
    slot = SLOT_WORDS[m[1]!.toLowerCase()];
    t = t.replace(slotRe, " ");
  }
  t = t
    .replace(/\b(?:today|tonight|this\s+(?:morning|afternoon|evening)|in\s+the\s+(?:morning|afternoon|evening)|yesterday|last\s+night|just\s+now|as\s+well|on\s+top)\b/gi, " ")
    .replace(/^\s*(?:please\s+)?(?:add|also|plus)\s+/i, "")
    .replace(/^\s*(?:log\s+)?(?:i\s+)?(?:also\s+)?(?:just\s+)?(?:have\s+|had\s+|ate\s+|eaten\s+|drank\s+|have\s+had\s+|had\s+eaten\s+)+/i, "")
    .replace(/\s+([,.;!])/g, "$1")
    .replace(/[\s.!]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  // "Last night" names the meal too: dinner, unless they said another one.
  if (!slot && /\blast\s+night\b/i.test(raw)) slot = "dinner";
  const tail = { ...(slot ? { slot } : {}), ...(extra ? { extra: true as const } : {}), ...(yesterday ? { yesterday: true as const } : {}) };
  return t.length >= 2 ? { text: t, ...tail } : { text: raw.trim(), ...tail };
}
