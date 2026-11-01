/**
 * Collapse multi-meal intake parser output into one session per occasion.
 * Prevents one lunch utterance from becoming N separate meal_log steps (and N DB sessions).
 */
import type { MealIntakeParseResult } from "../agents/health/mealIntakeParserAgent.js";

function distinctSlots(meals: MealIntakeParseResult["meals"]): string[] {
  const slots = new Set(meals.map((m) => m.mealSlot));
  return [...slots];
}

function countMealSlotsInMessage(message: string): number {
  const slots = ["breakfast", "lunch", "dinner", "snack"] as const;
  let count = 0;
  const lower = message.toLowerCase();
  for (const slot of slots) {
    if (new RegExp(`\\b(?:for\\s+)?${slot}\\b`, "i").test(lower)) {
      count += 1;
    }
  }
  return count;
}

/**
 * When the user logged one occasion (single slot, full-day recount off), merge parser splits
 * into a single meal_log step with combined components.
 */
export function collapseMealIntakeForSingleOccasion(
  intake: MealIntakeParseResult,
  userMessage: string,
): MealIntakeParseResult {
  if (intake.replaceTodayLog || intake.meals.length <= 1) {
    return intake;
  }

  const slots = distinctSlots(intake.meals);
  const explicitSlotsInMessage = countMealSlotsInMessage(userMessage);

  // Multiple distinct slots in parser output AND user named multiple slots → keep separate meals.
  if (slots.length > 1 && explicitSlotsInMessage > 1) {
    return intake;
  }

  // Same slot or unspecified — one eating occasion.
  if (slots.length === 1 || intake.meals.every((m) => m.mealSlot === "unspecified")) {
    const primarySlot = intake.meals.find((m) => m.mealSlot !== "unspecified")?.mealSlot ?? "unspecified";
    const mealText = intake.meals.map((m) => m.mealText).join("; ");
    const components = intake.meals.flatMap((m) => m.components);
    return {
      ...intake,
      meals: [
        {
          mealSlot: primarySlot,
          logKind: intake.meals[0]!.logKind,
          mealText,
          components,
        },
      ],
      parserNotes: intake.parserNotes
        ? `${intake.parserNotes}; collapsed_same_occasion`
        : "collapsed_same_occasion",
    };
  }

  return intake;
}
