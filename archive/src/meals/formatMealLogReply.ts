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

function macroLine(totals: {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}): string {
  return `~${Math.round(totals.calories)} kcal · P ${fmt(totals.protein_g, "g")} · C ${fmt(totals.carbs_g, "g")} · F ${fmt(totals.fat_g, "g")}`;
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

/** One-line target status for compact log replies. */
export function targetIndicatorsCompact(day: DayNutritionTotals, t: DailyTargets | null): string | null {
  const ind = targetIndicators(day, t);
  if (!ind.length) {
    return null;
  }
  return ind
    .map((line) => {
      const m = line.match(/^(🟢|🔴)\s+(\w+)/);
      return m ? `${m[1]} ${m[2]}` : line;
    })
    .join(" · ");
}

function slotLabel(slot: MealSlot): string | null {
  if (slot === "unspecified") {
    return null;
  }
  return slot.charAt(0).toUpperCase() + slot.slice(1);
}

type MealLogReplyInput = {
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
  daySessionCount: number;
  targets: DailyTargets | null;
};

/** Short default reply after logging — detail on request via meal breakdown. */
export function formatMealLogReplyCompact(input: MealLogReplyInput): string {
  const slot = input.mealSlot ?? "unspecified";
  const slotPart = slotLabel(slot);
  const header = slotPart ? `**${slotPart} logged**` : "**Meal logged**";
  const entryLabel = input.daySessionCount === 1 ? "entry" : "entries";
  const lines: string[] = [
    header,
    `**This meal:** ${macroLine(input.mealTotals)}`,
    `**Today (logged, ${input.daySessionCount} ${entryLabel}):** ${Math.round(input.day.calories)} kcal · P ${fmt(input.day.protein_g, "g")}`,
  ];

  const targets = targetIndicatorsCompact(input.day, input.targets);
  if (targets) {
    lines.push(targets);
  }

  if (input.planLink?.linked) {
    const title = input.planLink.planTitle ?? "planned meal";
    lines.push(
      input.planLink.matched ? `Plan matched: ${title} ✓` : `Plan note: ${title}`,
    );
  }

  lines.push("", "_Say **meal breakdown** for per-item detail._");
  return lines.join("\n");
}

/** Per-component detail (follow-up: "meal breakdown"). */
export function formatMealBreakdown(input: {
  mealSlot?: MealSlot;
  rawText?: string;
  components: MealComponentForRow[];
  mealTotals: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
}): string {
  const slot = input.mealSlot ?? "unspecified";
  const title = slotLabel(slot) ?? "Meal";
  const lines: string[] = [`**${title} breakdown**`, ""];

  for (const c of input.components) {
    lines.push(
      `- **${c.label}** · ${fmt(c.calories, " kcal")} · P ${fmt(c.protein_g, "g")} · C ${fmt(c.carbs_g, "g")} · F ${fmt(c.fat_g, "g")}`,
    );
  }

  lines.push("", `**Total:** ${macroLine(input.mealTotals)}`);

  const raw = input.rawText?.trim();
  if (raw) {
    lines.push("", raw.length > 120 ? `${raw.slice(0, 120)}…` : raw);
  }

  return lines.join("\n");
}

/** @deprecated Prefer compact + breakdown; kept for tests and legacy callers. */
export function formatMealLogReply(input: MealLogReplyInput): string {
  return formatMealLogReplyCompact(input);
}
