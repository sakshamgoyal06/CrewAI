import type { MealSlot } from "./parseMealLogCommand.js";

export type MacroTotals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type MealLogComposeEntry = {
  mealSlot: MealSlot;
  headline: string;
  totals: MacroTotals;
};

function fmt(n: number, unit: string): string {
  return `${Math.round(n * 10) / 10}${unit}`;
}

function macroLine(totals: MacroTotals): string {
  return `~${Math.round(totals.calories)} kcal · P ${fmt(totals.protein_g, "g")} · C ${fmt(totals.carbs_g, "g")} · F ${fmt(totals.fat_g, "g")}`;
}

function slotLabel(slot: MealSlot): string | null {
  if (slot === "unspecified") {
    return null;
  }
  return slot.charAt(0).toUpperCase() + slot.slice(1);
}

export function mealLogComposeHeadline(slot: MealSlot, rawText: string): string {
  const slotPart = slotLabel(slot);
  const food = rawText.trim();
  if (slotPart && food.length > 0 && food.length <= 80) {
    const lowerFood = food.toLowerCase();
    const lowerSlot = slotPart.toLowerCase();
    if (lowerFood.startsWith(lowerSlot)) {
      return food.charAt(0).toUpperCase() + food.slice(1);
    }
    return `${slotPart} — ${food}`;
  }
  if (slotPart) {
    return slotPart;
  }
  return food.length > 0 ? food : "Meal";
}

export function sumMacroTotals(entries: MealLogComposeEntry[]): MacroTotals {
  return entries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.totals.calories,
      protein_g: acc.protein_g + e.totals.protein_g,
      carbs_g: acc.carbs_g + e.totals.carbs_g,
      fat_g: acc.fat_g + e.totals.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

/**
 * Deterministic multi-meal reply — only meals that were actually saved (one entry per step).
 * Avoids LLM hallucinating extra meals or wrong day totals.
 */
export function formatMultiMealLogReply(input: {
  entries: MealLogComposeEntry[];
  dayTotals: MacroTotals;
}): string {
  if (input.entries.length === 0) {
    return "No meals were saved this turn.";
  }

  const turnTotals = sumMacroTotals(input.entries);
  const lines: string[] = [
    input.entries.length === 1 ? "**Meal logged**" : "**Meals logged**",
    "",
  ];

  for (const e of input.entries) {
    lines.push(`**${e.headline}** — ${macroLine(e.totals)}`);
  }

  lines.push(
    "",
    `**Logged this turn:** ${macroLine(turnTotals)}`,
    `**Today (on file):** ${Math.round(input.dayTotals.calories)} kcal · P ${fmt(input.dayTotals.protein_g, "g")}`,
    "",
    "_Say **meal breakdown** for per-item detail._",
  );

  return lines.join("\n");
}
