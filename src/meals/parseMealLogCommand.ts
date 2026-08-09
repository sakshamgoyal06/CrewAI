import { stripLeadingMealLogVerb } from "./mealPhrases.js";

/** Meal slot within a day (for plans, reminders, and log grouping). */
export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack" | "unspecified";

/** Kind of nutrition log entry. */
export type MealLogKind = "meal" | "snack" | "drink" | "supplement" | "correction";

export type ParsedMealCommand =
  | { kind: "meal"; text: string; slot: MealSlot; logKind: MealLogKind }
  | { kind: "none" };

const SLOT_NAMES = ["breakfast", "lunch", "dinner", "snack"] as const;
type NamedSlot = (typeof SLOT_NAMES)[number];

const MEAL_COMMAND_RES: Array<{
  re: RegExp;
  slotFromMatch?: (m: RegExpMatchArray) => MealSlot;
  logKind?: MealLogKind;
}> = [
  {
    re: /^(?:\/meal(?:@\S+)?)\s*(.+)$/is,
  },
  {
    re: /^meal:\s*(.+)$/is,
  },
  {
    re: /^log\s*meal:\s*(.+)$/is,
  },
  {
    re: /^log\s+(breakfast|lunch|dinner|snack):\s*(.+)$/is,
    slotFromMatch: (m) => m[1]!.toLowerCase() as NamedSlot,
  },
  {
    re: /^(?:ate|just\s+had):\s*(.+)$/is,
  },
];

function logKindForSlot(slot: MealSlot): MealLogKind {
  return slot === "snack" ? "snack" : "meal";
}

function parseWithRules(input: string): ParsedMealCommand {
  const t = input.trim();

  for (const rule of MEAL_COMMAND_RES) {
    const m = t.match(rule.re);
    if (!m) {
      continue;
    }

    let slot: MealSlot = "unspecified";
    let text: string;
    let logKind: MealLogKind = "meal";

    if (rule.slotFromMatch) {
      slot = rule.slotFromMatch(m);
      text = (m[2] ?? "").trim();
      logKind = logKindForSlot(slot);
    } else {
      text = (m[1] ?? "").trim();
    }

    if (!text || text.length < 2) {
      continue;
    }

    const cleaned = stripLeadingMealLogVerb(text);
    if (!cleaned || cleaned.length < 2) {
      continue;
    }

    return { kind: "meal", text: cleaned, slot, logKind };
  }

  return { kind: "none" };
}

/**
 * Explicit meal-log commands (avoids hijacking normal chat).
 * Supports /meal, meal:, log meal:, log lunch:, ate:, just had:, etc.
 */
export function parseMealLogCommand(input: string): ParsedMealCommand {
  return parseWithRules(input);
}

/** Cheap check before running the meal pipeline — avoids work on unrelated messages. */
export function isMealCommand(input: string): boolean {
  return parseMealLogCommand(input).kind === "meal";
}

const SLASH_MEAL_RE = /^\/meal(?:@\S+)?\b/i;

/** `/meal …` specifically, as opposed to the `meal:` / `log meal:` prefixes. */
export function isSlashMealCommand(input: string): boolean {
  return SLASH_MEAL_RE.test(input.trim()) && isMealCommand(input);
}
