/**
 * Fuzzy similarity for meal sessions — used before insert to avoid duplicate logs.
 */
import type { MealSessionSummary } from "../nutrition/store/mealHistoryStore.js";

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

/** Token overlap score (0–1) — max of Jaccard and containment for superset wording. */
export function mealSessionTextSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.size || !tb.size) {
    return 0;
  }
  let overlap = 0;
  for (const t of ta) {
    if (tb.has(t)) {
      overlap += 1;
    }
  }
  const union = ta.size + tb.size - overlap;
  const jaccard = union > 0 ? overlap / union : 0;
  const containment = overlap / Math.min(ta.size, tb.size);
  return Math.max(jaccard, containment);
}

const DUPLICATE_THRESHOLD = 0.72;

export function findDuplicateSession(
  rawText: string,
  recentSessions: MealSessionSummary[],
  options?: { sameSlotOnly?: boolean; mealSlot?: string },
): MealSessionSummary | null {
  const slot = options?.mealSlot;
  for (const session of recentSessions) {
    if (options?.sameSlotOnly && slot && session.mealSlot !== slot && session.mealSlot !== "unspecified") {
      continue;
    }
    const sim = mealSessionTextSimilarity(rawText, session.rawText);
    if (sim >= DUPLICATE_THRESHOLD) {
      return session;
    }
  }
  return null;
}
