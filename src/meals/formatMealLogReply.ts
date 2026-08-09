import type { MealSlot } from "./parseMealLogCommand.js";
import type { MealNutritionEstimate } from "./types.js";
import type { DayNutritionTotals, DailyTargets } from "./mealDaySummary.js";
import type { MealComponentForRow } from "./mealComponents.js";

function fmt(n: number | null, unit: string): string {
  if (n === null || Number.isNaN(n)) {
    return "—";
  }
  return `${Math.round(n * 10) / 10}${unit}`;
}

function dot(ok: boolean): string {
  return ok ? "🟢" : "🔴";
}

/** Calorie/carbs/fat: at or under target = good; protein: at or over target = good. */
export function targetIndicators(day: DayNutritionTotals, t: DailyTargets | null): string[] {
  if (!t) {
    return [];
  }
  const lines: string[] = [];
  if (t.daily_calorie_target !== null && t.daily_calorie_target > 0) {
    const ok = day.calories <= t.daily_calorie_target;
    lines.push(
      `${dot(ok)} Calories: ${day.calories}/${t.daily_calorie_target} kcal (≤ target)`,
    );
  }
  if (t.daily_protein_g_target !== null && t.daily_protein_g_target > 0) {
    const ok = day.protein_g >= t.daily_protein_g_target;
    lines.push(
      `${dot(ok)} Protein: ${fmt(day.protein_g, "g")}/${fmt(t.daily_protein_g_target, "g")} (≥ target)`,
    );
  }
  if (t.daily_carbs_g_target !== null && t.daily_carbs_g_target > 0) {
    const ok = day.carbs_g <= t.daily_carbs_g_target;
    lines.push(
      `${dot(ok)} Carbs: ${fmt(day.carbs_g, "g")}/${fmt(t.daily_carbs_g_target, "g")} (≤ target)`,
    );
  }
  if (t.daily_fat_g_target !== null && t.daily_fat_g_target > 0) {
    const ok = day.fat_g <= t.daily_fat_g_target;
    lines.push(
      `${dot(ok)} Fat: ${fmt(day.fat_g, "g")}/${fmt(t.daily_fat_g_target, "g")} (≤ target)`,
    );
  }
  return lines;
}

function slotLabel(slot: MealSlot): string | null {
  if (slot === "unspecified") {
    return null;
  }
  return slot.charAt(0).toUpperCase() + slot.slice(1);
}

export function formatMealLogReply(input: {
  mealSessionId: string;
  loggedDate: string;
  timezoneLabel: string;
  mealSlot?: MealSlot;
  planLink?: { linked: boolean; planTitle?: string; matched: boolean };
  rawText: string;
  estimate: MealNutritionEstimate;
  components: MealComponentForRow[];
  mealTotals: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  day: DayNutritionTotals;
  targets: DailyTargets | null;
}): string {
  const sid = input.mealSessionId.slice(0, 8);
  const slot = input.mealSlot ?? "unspecified";
  const slotPart = slotLabel(slot);
  const header = slotPart
    ? `**${slotPart}** \`${sid}…\` · ${input.loggedDate} (${input.timezoneLabel})`
    : `**Meal** \`${sid}…\` · ${input.loggedDate} (${input.timezoneLabel})`;
  const lines: string[] = [header, "", "**Components**"];

  if (input.components.length > 1) {
    lines.push(
      "_One line per ingredient/component saved to the log; **This meal (total)** is the sum of the lines (not double-counted)._",
    );
  }

  for (const c of input.components) {
    const pn = c.itemsSnapshot[0]?.portion_note?.trim();
    lines.push(
      `- **${c.label}** · ${fmt(c.calories, " kcal")} · P ${fmt(c.protein_g, "g")} · C ${fmt(c.carbs_g, "g")} · F ${fmt(c.fat_g, "g")}`,
    );
    if (pn) {
      lines.push(`  _${pn}_`);
    }
  }

  const sa = input.estimate.serving_assumption?.trim();
  if (sa) {
    lines.push("", "**Portion / source notes**", sa);
  }

  lines.push(
    "",
    "**This meal (total)**",
    `~${Math.round(input.mealTotals.calories)} kcal · P ${fmt(input.mealTotals.protein_g, "g")} · C ${fmt(input.mealTotals.carbs_g, "g")} · F ${fmt(input.mealTotals.fat_g, "g")}`,
    "",
    `**Today so far (${input.timezoneLabel})**`,
    `${Math.round(input.day.calories)} kcal · P ${fmt(input.day.protein_g, "g")} · C ${fmt(input.day.carbs_g, "g")} · F ${fmt(input.day.fat_g, "g")}`,
  );

  const ind = targetIndicators(input.day, input.targets);
  if (ind.length > 0) {
    lines.push("", "**Targets**", ...ind);
  } else {
    lines.push(
      "",
      "_Set daily targets in Health onboarding or say e.g. \"set my protein target to 140g\" to see 🟢/🔴._",
    );
  }

  if (input.planLink?.linked) {
    const title = input.planLink.planTitle ?? "planned meal";
    if (input.planLink.matched) {
      lines.push("", `**Plan:** matched ${title} ✓`);
    } else {
      lines.push("", `**Plan:** logged (planned: ${title})`);
    }
  }

  lines.push("", `Source: ${input.estimate.source}`);
  if (input.rawText.trim()) {
    const t = input.rawText.trim();
    lines.push(
      `Input: ${t.length > 160 ? `${t.slice(0, 160)}…` : t}`,
    );
  }

  return lines.join("\n");
}
