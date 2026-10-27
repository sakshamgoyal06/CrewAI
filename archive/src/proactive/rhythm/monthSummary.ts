import { activityStats } from "../../events/eventStore.js";
import { formatActivityStats } from "../../events/formatEvents.js";
import { offsetDateKey } from "../../nutrition/parseMealPlanJson.js";
import { supabase } from "../../tools/clients.js";
import { countCheckinsBetween, loadJoyScoresBetween } from "./checkinRhythm.js";

export type MonthRhythmSummary = {
  monthKey: string;
  text: string;
};

export async function buildMonthRhythmSummary(input: {
  userProfileId: string;
  dateKey: string;
}): Promise<MonthRhythmSummary> {
  const monthKey = input.dateKey.slice(0, 7);
  const monthStart = `${monthKey}-01`;
  const fromDate = offsetDateKey(input.dateKey, -29);

  const [statsResult, checkinCount, joyScores, profile, goals, projects] = await Promise.all([
    activityStats({ userProfileId: input.userProfileId, limit: 8 }),
    countCheckinsBetween(input.userProfileId, fromDate, input.dateKey),
    loadJoyScoresBetween(input.userProfileId, fromDate, input.dateKey),
    supabase
      .from("user_profile")
      .select("north_star_goal, display_name")
      .eq("id", input.userProfileId)
      .maybeSingle(),
    supabase
      .from("goals")
      .select("title, pillar, timeframe, status, target_date, description")
      .eq("user_profile_id", input.userProfileId)
      .eq("is_deleted", false)
      .in("status", ["active", "paused"])
      .order("timeframe", { ascending: true })
      .limit(12),
    supabase
      .from("projects")
      .select("title, status, target_date, primary_pillar")
      .eq("user_profile_id", input.userProfileId)
      .in("status", ["planning", "active"])
      .limit(8),
  ]);

  const activityText = formatActivityStats(statsResult.ok ? statsResult.data : []);

  const goalLines =
    (goals.data ?? []).map((g) => {
      const tf = String(g.timeframe ?? "");
      const status = String(g.status ?? "");
      const target = g.target_date ? ` by ${String(g.target_date)}` : "";
      return `- ${String(g.title)} (${String(g.pillar)}, ${tf}, ${status})${target}`;
    }) ?? [];

  const projectLines =
    (projects.data ?? []).map((p) => {
      const target = p.target_date ? ` → ${String(p.target_date)}` : "";
      const pillar = p.primary_pillar ? ` (${String(p.primary_pillar)})` : "";
      return `- ${String(p.title)} [${String(p.status)}]${pillar}${target}`;
    }) ?? [];

  let joyLine = "Joy tank: no scores in the last 30 days.";
  if (joyScores.length >= 2) {
    const avg = Math.round(joyScores.reduce((a, b) => a + b, 0) / joyScores.length);
    joyLine = `Joy tank: avg ${avg}/100 across ${joyScores.length} check-ins (last 30 days).`;
  } else if (joyScores.length === 1) {
    joyLine = `Joy tank: ${joyScores[0]} logged once in the last 30 days.`;
  }

  const northStar = profile.data?.north_star_goal
    ? String(profile.data.north_star_goal).trim()
    : null;

  const lines = [
    `Monthly review (${monthKey}):`,
    northStar ? `North star: ${northStar}` : "",
    `Check-ins (30d): ${checkinCount}.`,
    joyLine,
    "",
    "Commitment rhythm:",
    activityText,
    "",
    "Active goals:",
    goalLines.length ? goalLines.join("\n") : "No active goals on file.",
    "",
    "Active projects:",
    projectLines.length ? projectLines.join("\n") : "No active projects on file.",
    "",
    `Period anchor: ${monthStart} through ${input.dateKey}.`,
  ].filter(Boolean);

  return { monthKey, text: lines.join("\n") };
}
