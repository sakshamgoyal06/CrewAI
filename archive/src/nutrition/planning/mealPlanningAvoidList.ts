/**
 * Parse and enforce foods to avoid from health profile + user revision text.
 */
import type { MealPlanEntryInput } from "../parseMealPlanJson.js";

const AVOID_IN_RESTRICTIONS_RE = /\bavoid\s+([^.;\n]+)/gi;
const NO_FOOD_RE = /\bno\s+([a-z][a-z\s-]{1,30}?)(?:\s+anywhere|\s+in|\.|,|$)/gi;

function normalizeFoodToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/\.$/, "");
}

/** Foods the user must not see in plans (from onboarding restrictions). */
export function parseAvoidFoodsFromRestrictions(dietaryRestrictions: string | null): string[] {
  if (!dietaryRestrictions?.trim()) {
    return [];
  }
  const found = new Set<string>();
  for (const match of dietaryRestrictions.matchAll(AVOID_IN_RESTRICTIONS_RE)) {
    const token = normalizeFoodToken(match[1] ?? "");
    if (token.length >= 2) {
      found.add(token);
    }
  }
  return [...found];
}

/** Extra avoid tokens from a review-turn message (e.g. "remove lauki"). */
export function parseAvoidFoodsFromRevision(rawMessage: string): string[] {
  const found = new Set<string>();
  const lower = rawMessage.toLowerCase();

  for (const match of rawMessage.matchAll(AVOID_IN_RESTRICTIONS_RE)) {
    const token = normalizeFoodToken(match[1] ?? "");
    if (token.length >= 2) {
      found.add(token);
    }
  }

  const removeMatch = lower.match(/\b(?:remove|without|exclude|drop)\s+([a-z][a-z\s-]{1,24})/);
  if (removeMatch?.[1]) {
    found.add(normalizeFoodToken(removeMatch[1]));
  }

  for (const match of rawMessage.matchAll(NO_FOOD_RE)) {
    const token = normalizeFoodToken(match[1] ?? "");
    if (token.length >= 2 && !/^(meat|fish|eggs?)$/.test(token)) {
      found.add(token);
    }
  }

  return [...found];
}

export function mergeAvoidFoods(...lists: string[][]): string[] {
  return [...new Set(lists.flat().map(normalizeFoodToken).filter((t) => t.length >= 2))];
}

export function entryMentionsAvoidedFood(
  entry: MealPlanEntryInput,
  avoidFoods: string[],
): boolean {
  if (avoidFoods.length === 0) {
    return false;
  }
  const hay = `${entry.title} ${entry.description ?? ""}`.toLowerCase();
  return avoidFoods.some((food) => hay.includes(food));
}

export function filterAvoidedMealPlanEntries(
  entries: MealPlanEntryInput[],
  avoidFoods: string[],
): MealPlanEntryInput[] {
  if (avoidFoods.length === 0) {
    return entries;
  }
  return entries.filter((e) => !entryMentionsAvoidedFood(e, avoidFoods));
}

export function formatAvoidListForPrompt(avoidFoods: string[]): string {
  if (avoidFoods.length === 0) {
    return "";
  }
  return `\n**Hard avoid (never include in any meal title or description):** ${avoidFoods.join(", ")}.`;
}
