import { activityStats } from "../../events/eventStore.js";
import { formatActivityStats } from "../../events/formatEvents.js";
import { offsetDateKey } from "../../nutrition/parseMealPlanJson.js";
import {
  formatWeeklyNutritionSummary,
  loadWeeklyNutritionSummary,
} from "../../nutrition/analytics/weeklyNutritionSummary.js";
import { supabase } from "../../tools/clients.js";
import { countCheckinsBetween, loadJoyScoresBetween } from "./checkinRhythm.js";
import { weekDateKeys } from "./dateKeyRange.js";

export type WeekRhythmSummary = {
  fromDate: string;
  toDate: string;
  checkinCount: number;
  joyTrend: string;
  activityStatsText: string;
  nutritionText: string | null;
  northStar: string | null;
  weeklyGoalsText: string;
  text: string;
};

export async function buildWeekRhythmSummary(input: {
  userProfileId: string;
  endDateKey: string;
}): Promise<WeekRhythmSummary> {
  const fromDate = offsetDateKey(input.endDateKey, -6);
  const weekKeys = weekDateKeys(input.endDateKey);

  const [statsResult, checkinCount, joyScores, nutrition, profile, goals] = await Promise.all([
    activityStats({ userProfileId: input.userProfileId, limit: 6 }),
    countCheckinsBetween(input.userProfileId, fromDate, input.endDateKey),
    loadJoyScoresBetween(input.userProfileId, fromDate, input.endDateKey),
    loadWeeklyNutritionSummary(input.userProfileId, input.endDateKey),
    supabase
      .from("user_profile")
      .select("north_star_goal")
      .eq("id", input.userProfileId)
      .maybeSingle(),
    supabase
      .from("goals")
      .select("title, pillar, timeframe, status")
      .eq("user_profile_id", input.userProfileId)
      .eq("is_deleted", false)
      .in("timeframe", ["weekly", "north_star"])
      .eq("status", "active")
      .limit(8),
  ]);

  const activityRows = statsResult.ok ? statsResult.data : [];
  const activityStatsText = formatActivityStats(activityRows);

  let joyTrend = "No joy scores logged this week.";
  if (joyScores.length >= 2) {
    const first = joyScores[0];
    const last = joyScores[joyScores.length - 1];
    const delta = last - first;
    const dir = delta > 5 ? "up" : delta < -5 ? "down" : "steady";
    joyTrend = `Joy tank: ${first} → ${last} (${dir} over ${joyScores.length} check-ins).`;
  } else if (joyScores.length === 1) {
    joyTrend = `Joy tank: ${joyScores[0]} logged once this week.`;
  }

  const nutritionText = nutrition ? formatWeeklyNutritionSummary(nutrition) : null;

  const goalRows = goals.data ?? [];
  const weeklyGoalsText =
    goalRows.length > 0
      ? goalRows
          .map((g) => {
            const tf = String(g.timeframe ?? "");
            const pillar = String(g.pillar ?? "");
            return `- ${String(g.title)} (${pillar}, ${tf})`;
          })
          .join("\n")
      : "No active weekly or north-star goals in LifeOS.";

  const northStar = profile.data?.north_star_goal
    ? String(profile.data.north_star_goal).trim()
    : null;

  const lines = [
    `Week ${fromDate} → ${input.endDateKey} (${weekKeys.length} days):`,
    `Check-ins logged: ${checkinCount} of 7.`,
    joyTrend,
    "",
    "Rhythm (commitments):",
    activityStatsText,
    "",
    "Goals:",
    weeklyGoalsText,
  ];

  if (northStar) {
    lines.splice(1, 0, `North star: ${northStar}`);
  }

  if (nutritionText) {
    lines.push("", "Nutrition:", nutritionText);
  }

  return {
    fromDate,
    toDate: input.endDateKey,
    checkinCount,
    joyTrend,
    activityStatsText,
    nutritionText,
    northStar,
    weeklyGoalsText,
    text: lines.join("\n"),
  };
}
