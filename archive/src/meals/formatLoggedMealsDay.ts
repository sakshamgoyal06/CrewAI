import type { MealSessionSummary } from "../nutrition/store/mealHistoryStore.js";
import type { DayNutritionTotals } from "./mealDaySummary.js";

function slotPrefix(slot: string): string {
  if (slot === "unspecified") {
    return "";
  }
  return `${slot.charAt(0).toUpperCase()}${slot.slice(1)}: `;
}

/** Day overview / history — logged meals only (not planned). */
export function formatLoggedMealsDay(
  sessions: MealSessionSummary[],
  totals: DayNutritionTotals,
  label: string,
  localDate: string,
): string {
  if (!sessions.length) {
    return `No meals **logged** for **${label}** (${localDate}).`;
  }

  const lines = [`**${label} — logged** (${localDate})`, ""];
  for (const s of sessions) {
    const text =
      s.rawText.length > 60 ? `${s.rawText.slice(0, 60)}…` : s.rawText;
    lines.push(
      `• ${slotPrefix(s.mealSlot)}${text} — ~${Math.round(s.calories)} kcal`,
    );
  }
  lines.push(
    "",
    `**Logged total:** ${totals.calories} kcal · P ${totals.protein_g}g`,
  );
  return lines.join("\n");
}
