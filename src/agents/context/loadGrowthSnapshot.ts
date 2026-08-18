/**
 * Growth-oriented snapshot for routing — lists, goals, behavior narrative, today's win, KPIs.
 * Keeps routing aligned with the user's actual growth (not just intent disambiguation).
 */
import { lifeosContextEnabled } from "../../config/lifeosContext.js";
import { getLocalTimeParts } from "../../jobs/morningBriefTime.js";
import { getWinConditionPending } from "../../jobs/winConditionPending.js";
import { loadListMemoryContext } from "../../lists/listMemory.js";
import { fetchCheckinItem, fetchListBySlug } from "../../lists/listStore.js";
import { listActiveLifeosGoals } from "../../lifeos/lifeosStore.js";
import { offsetDateKey } from "../../nutrition/parseMealPlanJson.js";
import { supabase } from "../../tools/clients.js";
import { logger } from "../../logger.js";
import { loggableError } from "../../util/loggableError.js";
import { loadUserProgramMemory } from "../../users/userProgramMemory.js";
import { loadSemanticFacts } from "../memory/semanticMemory.js";
import { parseMarkdownSectionBullets } from "../memory/userKnowledge.js";
import type { RoutingGrowthContext } from "./types.js";

const GYM_ACTIVITY_RE = /\b(gym|workout|train|hevy|push|pull|legs|cardio)\b/i;
const LATE_EVENING_HOUR = 21;
const MAX_NARRATIVE_BULLETS = 8;
const MAX_LOG_SNIPPETS = 6;

function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) {
    return t;
  }
  return `${t.slice(0, max)}…`;
}

function firstLine(body: string): string {
  return body.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
}

function programLearningsBody(
  rows: Array<{ section: string; body: string }>,
): string {
  return rows.find((r) => r.section === "program_learnings")?.body ?? "";
}

/** Compact bullets for classifier — issues, wins, recent logs, semantic facts. */
export function buildBehaviorNarrative(input: {
  recentIssues: string[];
  recentWins: string[];
  dailyLogSnippets: Array<{ date: string; snippet: string }>;
  semanticFacts: string[];
}): string[] {
  const bullets: string[] = [];

  for (const issue of input.recentIssues.slice(0, 3)) {
    bullets.push(`Watch: ${truncate(issue, 120)}`);
  }
  for (const win of input.recentWins.slice(0, 2)) {
    bullets.push(`Win: ${truncate(win, 120)}`);
  }
  for (const log of input.dailyLogSnippets.slice(0, 4)) {
    bullets.push(`${log.date}: ${truncate(log.snippet, 140)}`);
  }
  for (const fact of input.semanticFacts.slice(0, 3)) {
    if (!bullets.some((b) => b.includes(fact.slice(0, 40)))) {
      bullets.push(`Fact: ${truncate(fact, 120)}`);
    }
  }

  return bullets.slice(0, MAX_NARRATIVE_BULLETS);
}

export function computeShowUpRate(done: number, total: number): number | undefined {
  if (total <= 0) {
    return undefined;
  }
  return Math.round((done / total) * 100);
}

export function isLateEveningHour(hour: number): boolean {
  return hour >= LATE_EVENING_HOUR;
}

async function loadTodayCheckinWin(
  userProfileId: string,
  dateKey: string,
): Promise<{ morningIntention?: string; energyLevel?: number }> {
  const list = await fetchListBySlug(userProfileId, "checkins");
  if (!list.ok || !list.data) {
    return {};
  }
  const item = await fetchCheckinItem(userProfileId, list.data.id, dateKey);
  if (!item.ok || !item.data?.extra) {
    return {};
  }
  const extra = item.data.extra;
  const morningIntention = extra["Morning Intention"];
  const energyLevel = extra["Energy Level"];
  return {
    morningIntention:
      morningIntention != null && String(morningIntention).trim()
        ? String(morningIntention).trim()
        : undefined,
    energyLevel:
      energyLevel != null && Number.isFinite(Number(energyLevel))
        ? Number(energyLevel)
        : undefined,
  };
}

async function loadRecentDailyLogs(
  userProfileId: string,
  limit: number,
): Promise<Array<{ date: string; snippet: string }>> {
  try {
    const { data, error } = await supabase
      .from("magnus_daily_logs")
      .select("log_date, body, created_at")
      .eq("user_profile_id", userProfileId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data?.length) {
      return [];
    }

    return data
      .map((row) => {
        const body = typeof row.body === "string" ? row.body : "";
        const snippet = firstLine(body);
        if (!snippet) {
          return null;
        }
        const date =
          typeof row.log_date === "string" && row.log_date
            ? row.log_date
            : String(row.created_at ?? "").slice(0, 10);
        return { date, snippet };
      })
      .filter((r): r is { date: string; snippet: string } => r != null);
  } catch (err) {
    logger.debug({ err: loggableError(err) }, "growth: daily logs load failed");
    return [];
  }
}

async function loadJoyTank(
  userProfileId: string,
  dateKey: string,
): Promise<{ level: number; date: string } | undefined> {
  if (!lifeosContextEnabled()) {
    return loadJoyFromCheckin(userProfileId, dateKey);
  }

  try {
    const { data } = await supabase
      .from("happiness_reserve")
      .select("level, date")
      .eq("user_profile_id", userProfileId)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.level != null && Number.isFinite(Number(data.level))) {
      return { level: Number(data.level), date: String(data.date ?? dateKey) };
    }
  } catch {
    /* table may be missing */
  }

  return loadJoyFromCheckin(userProfileId, dateKey);
}

async function loadJoyFromCheckin(
  userProfileId: string,
  dateKey: string,
): Promise<{ level: number; date: string } | undefined> {
  const list = await fetchListBySlug(userProfileId, "checkins");
  if (!list.ok || !list.data) {
    return undefined;
  }
  const item = await fetchCheckinItem(userProfileId, list.data.id, dateKey);
  if (!item.ok || !item.data?.extra) {
    return undefined;
  }
  const joy = item.data.extra["Joy Score"];
  const n = typeof joy === "number" ? joy : Number(joy);
  if (!Number.isFinite(n) || n <= 0) {
    return undefined;
  }
  return { level: n, date: dateKey };
}

async function loadPillarStatus(
  userProfileId: string,
): Promise<Array<{ pillar: string; status: string; summary?: string }>> {
  if (!lifeosContextEnabled()) {
    return [];
  }
  try {
    const since = new Date();
    since.setDate(since.getDate() - 14);
    const { data } = await supabase
      .from("pillar_status")
      .select("pillar, status, summary, date")
      .eq("user_profile_id", userProfileId)
      .gte("date", since.toISOString().slice(0, 10))
      .order("date", { ascending: false })
      .limit(12);

    if (!data?.length) {
      return [];
    }

    const byPillar = new Map<string, { pillar: string; status: string; summary?: string }>();
    for (const row of data) {
      const pillar = String(row.pillar ?? "");
      if (!pillar || byPillar.has(pillar)) {
        continue;
      }
      byPillar.set(pillar, {
        pillar,
        status: String(row.status ?? ""),
        summary: typeof row.summary === "string" ? row.summary.trim() || undefined : undefined,
      });
    }
    return [...byPillar.values()].slice(0, 5);
  } catch {
    return [];
  }
}

async function loadActivityStats(
  userProfileId: string,
): Promise<RoutingGrowthContext["kpis"]["activityStats"]> {
  try {
    const { data } = await supabase
      .from("magnus_event_activity_stats")
      .select("activity, done_count, missed_count, total, pillar")
      .eq("user_profile_id", userProfileId)
      .order("total", { ascending: false })
      .limit(12);

    if (!data?.length) {
      return [];
    }

    return data
      .map((row) => {
        const done = Number(row.done_count ?? 0);
        const missed = Number(row.missed_count ?? 0);
        const total = Number(row.total ?? 0);
        return {
          activity: String(row.activity ?? ""),
          pillar: String(row.pillar ?? ""),
          done,
          missed,
          total,
          showUpRate: computeShowUpRate(done, total),
        };
      })
      .filter((r) => r.activity && r.total > 0)
      .slice(0, 6);
  } catch {
    return [];
  }
}

async function countRecentGymMisses(
  userProfileId: string,
  timezone: string,
  lookbackDays: number,
): Promise<number> {
  try {
    const now = new Date();
    const local = getLocalTimeParts(now, timezone);
    const fromKey = offsetDateKey(local.dateKey, -lookbackDays);

    const { data } = await supabase
      .from("magnus_events")
      .select("status, title, activity_key, planned_start_at")
      .eq("user_profile_id", userProfileId)
      .gte("planned_start_at", `${fromKey}T00:00:00`)
      .lte("planned_start_at", `${local.dateKey}T23:59:59`)
      .in("status", ["missed", "skipped", "planned"])
      .limit(40);

    if (!data?.length) {
      return 0;
    }

    let misses = 0;
    for (const row of data) {
      const title = String(row.title ?? "");
      const activityKey = String(row.activity_key ?? "");
      const blob = `${title} ${activityKey}`.toLowerCase();
      if (!GYM_ACTIVITY_RE.test(blob)) {
        continue;
      }
      const status = String(row.status ?? "");
      if (status === "missed" || status === "skipped") {
        misses += 1;
      } else if (status === "planned") {
        const planned = row.planned_start_at ? new Date(String(row.planned_start_at)) : null;
        if (planned && planned.getTime() < now.getTime()) {
          misses += 1;
        }
      }
    }
    return misses;
  } catch {
    return 0;
  }
}

function routineConsistencyHint(
  activityStats: RoutingGrowthContext["kpis"]["activityStats"],
  gymMisses: number,
): string | undefined {
  const gymStat = activityStats.find((s) => GYM_ACTIVITY_RE.test(s.activity));
  if (gymMisses >= 2) {
    return `Gym missed or skipped ${gymMisses} times recently — protect recovery and show-up tomorrow.`;
  }
  if (gymStat?.showUpRate != null && gymStat.showUpRate < 60 && gymStat.total >= 3) {
    return `Gym show-up rate ~${gymStat.showUpRate}% (${gymStat.done}/${gymStat.total}) — consistency is the lever.`;
  }
  const weakest = [...activityStats]
    .filter((s) => s.total >= 3 && s.showUpRate != null && s.showUpRate < 70)
    .sort((a, b) => (a.showUpRate ?? 100) - (b.showUpRate ?? 100))[0];
  if (weakest) {
    return `${weakest.activity} show-up ~${weakest.showUpRate}% — routine slipping.`;
  }
  return undefined;
}

export type LoadGrowthSnapshotInput = {
  userProfileId: string;
  timezone: string;
  now?: Date;
};

export async function loadGrowthSnapshot(
  input: LoadGrowthSnapshotInput,
): Promise<RoutingGrowthContext> {
  const now = input.now ?? new Date();
  const timezone = input.timezone.trim() || "UTC";
  const local = getLocalTimeParts(now, timezone);

  const [
    listMemory,
    programRows,
    winPending,
    checkinToday,
    dailyLogs,
    semanticFacts,
    goalsResult,
    joyTank,
    pillarStatus,
    activityStats,
    gymMisses,
  ] = await Promise.all([
    loadListMemoryContext(input.userProfileId),
    loadUserProgramMemory(input.userProfileId),
    getWinConditionPending(input.userProfileId),
    loadTodayCheckinWin(input.userProfileId, local.dateKey),
    loadRecentDailyLogs(input.userProfileId, MAX_LOG_SNIPPETS),
    loadSemanticFacts(input.userProfileId, 8),
    lifeosContextEnabled()
      ? listActiveLifeosGoals(input.userProfileId, 8)
      : Promise.resolve({ ok: true as const, data: [] }),
    loadJoyTank(input.userProfileId, local.dateKey),
    loadPillarStatus(input.userProfileId),
    loadActivityStats(input.userProfileId),
    countRecentGymMisses(input.userProfileId, timezone, 5),
  ]);

  const learnings = programLearningsBody(programRows);
  const recentIssues = parseMarkdownSectionBullets(learnings, "Not working / watch").slice(0, 4);
  const recentWins = parseMarkdownSectionBullets(learnings, "Working").slice(0, 3);

  const behaviorNarrative = buildBehaviorNarrative({
    recentIssues,
    recentWins,
    dailyLogSnippets: dailyLogs,
    semanticFacts,
  });

  const goals =
    goalsResult.ok && goalsResult.data.length > 0
      ? goalsResult.data.map((g) => ({
          title: g.title,
          pillar: g.pillar,
          status: g.status,
        }))
      : [];

  const lists = listMemory.catalog.map((c) => ({
    slug: c.slug,
    displayName: c.displayName,
    openCount: c.openCount,
  }));

  const consistencyHint = routineConsistencyHint(activityStats, gymMisses);

  return {
    localTime: {
      dateKey: local.dateKey,
      hour: local.hour,
      minute: local.minute,
      isLateEvening: isLateEveningHour(local.hour),
    },
    lists,
    listHighlights: listMemory.openHighlights.slice(0, 8).map((h) => ({
      slug: h.slug,
      title: h.title,
      status: h.status,
    })),
    goals,
    todayWin: {
      morningIntention: checkinToday.morningIntention,
      energyLevel: checkinToday.energyLevel,
      winConditionPending: winPending
        ? { phase: winPending.phase, candidateText: winPending.candidateText }
        : undefined,
    },
    behavior: {
      recentIssues,
      recentWins,
      dailyLogSnippets: dailyLogs,
      narrativeBullets: behaviorNarrative,
    },
    kpis: {
      joyTank,
      pillarStatus,
      activityStats,
      gymMissStreakDays: gymMisses > 0 ? gymMisses : undefined,
      routineConsistencyHint: consistencyHint,
    },
  };
}
