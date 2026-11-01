/**
 * Seven-day nutrition rollup summary for weekly review proactive kind.
 */
import { offsetDateKey } from "./anomalyDetector.js";
import { supabase } from "../../tools/clients.js";

export type WeeklyNutritionSummary = {
  fromDate: string;
  toDate: string;
  daysLogged: number;
  avgCalories: number | null;
  avgProtein_g: number | null;
  avgAdherence: number | null;
  topFlags: string[];
  missedSlotCounts: Record<string, number>;
};

function num(v: unknown): number {
  if (v === null || v === undefined) {
    return 0;
  }
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseFlags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((f): f is string => typeof f === "string");
  }
  return [];
}

export async function loadWeeklyNutritionSummary(
  userProfileId: string,
  endDate: string,
): Promise<WeeklyNutritionSummary | null> {
  const fromDate = offsetDateKey(endDate, -6);

  const { data, error } = await supabase
    .from("meal_daily_rollups")
    .select(
      "local_date, calories, protein_g, meal_count, snack_count, adherence_score, flags, slots_missed",
    )
    .eq("user_profile_id", userProfileId)
    .gte("local_date", fromDate)
    .lte("local_date", endDate)
    .order("local_date", { ascending: true });

  if (error) {
    const msg = error.message ?? String(error);
    if (msg.includes("meal_daily_rollups") || msg.includes("does not exist")) {
      return null;
    }
    return null;
  }

  const rows = data ?? [];
  if (!rows.length) {
    return null;
  }

  let daysLogged = 0;
  let calSum = 0;
  let proteinSum = 0;
  let adherenceSum = 0;
  let adherenceCount = 0;
  const flagCounts = new Map<string, number>();
  const missedSlotCounts: Record<string, number> = {};

  for (const row of rows) {
    const meals = num(row.meal_count) + num(row.snack_count);
    if (meals > 0) {
      daysLogged += 1;
    }
    calSum += num(row.calories);
    proteinSum += num(row.protein_g);

    if (row.adherence_score != null) {
      adherenceSum += num(row.adherence_score);
      adherenceCount += 1;
    }

    for (const flag of parseFlags(row.flags)) {
      flagCounts.set(flag, (flagCounts.get(flag) ?? 0) + 1);
    }

    for (const slot of (row.slots_missed as string[] | null) ?? []) {
      missedSlotCounts[slot] = (missedSlotCounts[slot] ?? 0) + 1;
    }
  }

  const dayCount = rows.length;
  const topFlags = [...flagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([flag, count]) => `${flag} (${count}d)`);

  return {
    fromDate,
    toDate: endDate,
    daysLogged,
    avgCalories: dayCount ? Math.round(calSum / dayCount) : null,
    avgProtein_g: dayCount ? Math.round((proteinSum / dayCount) * 10) / 10 : null,
    avgAdherence:
      adherenceCount > 0 ? Math.round((adherenceSum / adherenceCount) * 100) / 100 : null,
    topFlags,
    missedSlotCounts,
  };
}

export function formatWeeklyNutritionSummary(summary: WeeklyNutritionSummary): string {
  const lines = [
    `Week ${summary.fromDate} → ${summary.toDate}:`,
    `- Days with logs: ${summary.daysLogged}/7`,
  ];
  if (summary.avgCalories != null) {
    lines.push(`- Avg calories: ${summary.avgCalories}/day`);
  }
  if (summary.avgProtein_g != null) {
    lines.push(`- Avg protein: ${summary.avgProtein_g}g/day`);
  }
  if (summary.avgAdherence != null) {
    lines.push(`- Avg plan adherence: ${Math.round(summary.avgAdherence * 100)}%`);
  }
  if (summary.topFlags.length) {
    lines.push(`- Recurring flags: ${summary.topFlags.join(", ")}`);
  }
  const missed = Object.entries(summary.missedSlotCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([slot, count]) => `${slot} (${count}x)`);
  if (missed.length) {
    lines.push(`- Missed planned slots: ${missed.join(", ")}`);
  }
  return lines.join("\n");
}
