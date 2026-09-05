/**
 * Growth-oriented snapshot for routing — commitments, projects, north star, day frame, KPIs.
 * Reads only from per-user stores; nothing gym- or activity-specific hardcoded.
 */
import { lifeosContextEnabled } from "../../config/lifeosContext.js";
import { getLocalTimeParts } from "../../jobs/morningBriefTime.js";
import { getWinConditionPending } from "../../jobs/winConditionPending.js";
import { loadListMemoryContext } from "../../lists/listMemory.js";
import { ensureUserLists } from "../../lists/listService.js";
import { fetchCheckinItem, fetchListBySlug, queryListItems } from "../../lists/listStore.js";
import { offsetDateKey } from "../../nutrition/parseMealPlanJson.js";
import { buildActiveProjectSummaries } from "../../projects/projectExecutor.js";
import { supabase } from "../../tools/clients.js";
import { logger } from "../../logger.js";
import { loggableError } from "../../util/loggableError.js";
import { loadUserProgramMemory } from "../../users/userProgramMemory.js";
import { loadSemanticFacts } from "../memory/semanticMemory.js";
import { parseMarkdownSectionBullets } from "../memory/userKnowledge.js";
import {
  buildBehaviorNarrative,
  buildSlippingRoutines,
  inferDayFrameTone,
  isEventOverdue,
  isLateEveningHour,
  localWeekdayIndex,
  projectConsistencyHint,
  routineConsistencyHint,
} from "./growthHelpers.js";
import type { RoutingGrowthContext } from "./types.js";

const LATE_EVENING_HOUR = 21;
const MAX_LOG_SNIPPETS = 8;
const ERRAND_LIST_SLUG_RE = /(?:task|errand|shopping|todo|chore|admin)/i;

function firstLine(body: string): string {
  return body.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
}

function programSectionBody(
  rows: Array<{ section: string; body: string }>,
  section: string,
): string {
  return rows.find((r) => r.section === section)?.body ?? "";
}

function strExtra(extra: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = extra?.[key];
  if (v == null) {
    return undefined;
  }
  const s = String(v).trim();
  return s || undefined;
}

function numExtra(extra: Record<string, unknown> | undefined, key: string): number | undefined {
  const v = extra?.[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

async function loadTodayCheckin(
  userProfileId: string,
  dateKey: string,
): Promise<{
  morningIntention?: string;
  energyLevel?: number;
  feeling?: string;
  dayRating?: string;
  weekPriorities?: string;
}> {
  const list = await fetchListBySlug(userProfileId, "checkins");
  if (!list.ok || !list.data) {
    return {};
  }
  const item = await fetchCheckinItem(userProfileId, list.data.id, dateKey);
  if (!item.ok || !item.data?.extra) {
    return {};
  }
  const extra = item.data.extra;
  return {
    morningIntention: strExtra(extra, "Morning Intention"),
    energyLevel: numExtra(extra, "Energy Level"),
    feeling: strExtra(extra, "How Are You Feeling"),
    dayRating: strExtra(extra, "Day Rating"),
    weekPriorities: strExtra(extra, "Week Priorities"),
  };
}

async function loadDailyPlanIntention(
  userProfileId: string,
  dateKey: string,
): Promise<string | undefined> {
  if (!lifeosContextEnabled()) {
    return undefined;
  }
  try {
    const { data } = await supabase
      .from("daily_plans")
      .select("morning_intention, top_3_priorities")
      .eq("user_profile_id", userProfileId)
      .eq("date", dateKey)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const intention =
      typeof data?.morning_intention === "string" ? data.morning_intention.trim() : "";
    if (intention) {
      return intention;
    }
    const priorities = data?.top_3_priorities;
    if (Array.isArray(priorities) && priorities.length > 0) {
      return priorities
        .slice(0, 3)
        .map((p) => String(p).trim())
        .filter(Boolean)
        .join("; ");
    }
  } catch {
    /* table optional */
  }
  return undefined;
}

async function loadRecentDailyLogs(
  userProfileId: string,
  limit: number,
): Promise<Array<{ date: string; snippet: string; isToday: boolean }>> {
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
        return { date, snippet, isToday: false };
      })
      .filter((r): r is { date: string; snippet: string; isToday: boolean } => r != null);
  } catch (err) {
    logger.debug({ err: loggableError(err) }, "growth: daily logs load failed");
    return [];
  }
}

async function loadNorthStarGoals(
  userProfileId: string,
): Promise<RoutingGrowthContext["northStar"]["goals"]> {
  if (!lifeosContextEnabled()) {
    return [];
  }
  try {
    const { data } = await supabase
      .from("goals")
      .select("title, pillar, timeframe, status")
      .eq("user_profile_id", userProfileId)
      .eq("status", "active")
      .eq("is_deleted", false)
      .order("updated_at", { ascending: false })
      .limit(12);

    return (data ?? []).map((row) => ({
      title: String(row.title ?? ""),
      pillar: String(row.pillar ?? "life"),
      timeframe: String(row.timeframe ?? "weekly"),
      status: String(row.status ?? "active"),
    }));
  } catch {
    return [];
  }
}

async function loadJoyTank(
  userProfileId: string,
  dateKey: string,
): Promise<{ level: number; date: string } | undefined> {
  if (lifeosContextEnabled()) {
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
      /* optional table */
    }
  }

  const list = await fetchListBySlug(userProfileId, "checkins");
  if (!list.ok || !list.data) {
    return undefined;
  }
  const item = await fetchCheckinItem(userProfileId, list.data.id, dateKey);
  if (!item.ok || !item.data?.extra) {
    return undefined;
  }
  const n = numExtra(item.data.extra, "Joy Score");
  if (n == null || n <= 0) {
    return undefined;
  }
  return { level: n, date: dateKey };
}

async function loadPillarStatus(
  userProfileId: string,
): Promise<RoutingGrowthContext["kpis"]["pillarStatus"]> {
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

    const byPillar = new Map<string, { pillar: string; status: string; summary?: string }>();
    for (const row of data ?? []) {
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

async function loadTopRoutines(
  userProfileId: string,
): Promise<RoutingGrowthContext["kpis"]["topRoutines"]> {
  try {
    const { data } = await supabase
      .from("magnus_event_activity_stats")
      .select("activity, done_count, missed_count, total, pillar")
      .eq("user_profile_id", userProfileId)
      .order("total", { ascending: false })
      .limit(12);

    return (data ?? [])
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
          showUpRate: total > 0 ? Math.round((done / total) * 100) : undefined,
        };
      })
      .filter((r) => r.activity && r.total > 0)
      .slice(0, 6);
  } catch {
    return [];
  }
}

type EventRow = {
  title: string;
  status: string;
  pillar: string;
  activity_key: string | null;
  planned_start_at: string | null;
  planned_end_at: string | null;
};

async function loadCommitments(
  userProfileId: string,
  dateKey: string,
  timezone: string,
  now: Date,
): Promise<{
  today: RoutingGrowthContext["operations"]["todayCommitments"];
  overdueCount: number;
  recentMissesByKey: Map<string, { activity: string; pillar?: string; misses: number }>;
}> {
  const fromKey = offsetDateKey(dateKey, -7);
  const todayStart = `${dateKey}T00:00:00`;
  const todayEnd = `${dateKey}T23:59:59`;

  try {
    const { data } = await supabase
      .from("magnus_events")
      .select("title, status, pillar, activity_key, planned_start_at, planned_end_at")
      .eq("user_profile_id", userProfileId)
      .gte("planned_start_at", `${fromKey}T00:00:00`)
      .lte("planned_start_at", todayEnd)
      .limit(60);

    if (!data?.length) {
      return { today: [], overdueCount: 0, recentMissesByKey: new Map() };
    }

    const today: RoutingGrowthContext["operations"]["todayCommitments"] = [];
    let overdueCount = 0;
    const recentMissesByKey = new Map<
      string,
      { activity: string; pillar?: string; misses: number }
    >();

    for (const raw of data as EventRow[]) {
      const status = String(raw.status ?? "");
      const plannedStart = raw.planned_start_at;
      const isToday =
        plannedStart != null &&
        plannedStart >= todayStart &&
        plannedStart <= todayEnd;

      if (isToday && (status === "planned" || status === "in_progress")) {
        const overdue = isEventOverdue({
          status,
          plannedStartAt: plannedStart,
          plannedEndAt: raw.planned_end_at,
          now,
        });
        today.push({
          title: String(raw.title ?? ""),
          status,
          pillar: String(raw.pillar ?? ""),
          activityKey: raw.activity_key,
          plannedStartAt: plannedStart,
          overdue,
        });
        if (overdue) {
          overdueCount += 1;
        }
      } else if (
        !isToday &&
        plannedStart != null &&
        plannedStart < todayStart &&
        (status === "planned" || status === "in_progress")
      ) {
        overdueCount += 1;
      }

      if (status === "missed" || status === "skipped") {
        const key = raw.activity_key?.trim() || String(raw.title ?? "").toLowerCase().slice(0, 40);
        if (!key) {
          continue;
        }
        const existing = recentMissesByKey.get(key);
        recentMissesByKey.set(key, {
          activity: raw.activity_key ?? String(raw.title ?? key),
          pillar: String(raw.pillar ?? ""),
          misses: (existing?.misses ?? 0) + 1,
        });
      }
    }

    today.sort((a, b) => {
      const ta = a.plannedStartAt ? new Date(a.plannedStartAt).getTime() : 0;
      const tb = b.plannedStartAt ? new Date(b.plannedStartAt).getTime() : 0;
      return ta - tb;
    });

    return { today: today.slice(0, 10), overdueCount, recentMissesByKey };
  } catch (err) {
    logger.debug({ err: loggableError(err), timezone }, "growth: commitments load failed");
    return { today: [], overdueCount: 0, recentMissesByKey: new Map() };
  }
}

async function loadErrands(
  userProfileId: string,
  todayCommitments: RoutingGrowthContext["operations"]["todayCommitments"],
): Promise<RoutingGrowthContext["operations"]["errands"]> {
  const errands: RoutingGrowthContext["operations"]["errands"] = [];

  for (const c of todayCommitments) {
    if (c.pillar === "magnus" || /\b(?:errand|admin|chore|pickup|drop|bill|renew)\b/i.test(c.title)) {
      errands.push({ source: "event", title: c.title, status: c.status });
    }
  }

  try {
    const lists = await ensureUserLists(userProfileId);
    for (const list of lists) {
      if (!ERRAND_LIST_SLUG_RE.test(list.slug)) {
        continue;
      }
      const items = await queryListItems({
        userProfileId,
        listId: list.id,
        openStatuses: list.open_statuses.length > 0 ? list.open_statuses : undefined,
        limit: 6,
      });
      if (!items.ok) {
        continue;
      }
      for (const item of items.data.slice(0, 4)) {
        errands.push({
          source: list.slug === "tasks" ? "task" : "list",
          slug: list.slug,
          title: item.title,
          status: item.status ?? undefined,
        });
      }
    }
  } catch {
    /* lists optional */
  }

  return errands.slice(0, 10);
}

export type LoadGrowthSnapshotInput = {
  userProfileId: string;
  timezone: string;
  northStarGoal?: string;
  now?: Date;
};

export async function loadGrowthSnapshot(
  input: LoadGrowthSnapshotInput,
): Promise<RoutingGrowthContext> {
  const now = input.now ?? new Date();
  const timezone = input.timezone.trim() || "UTC";
  const local = getLocalTimeParts(now, timezone);
  const dayIndex = localWeekdayIndex(now, timezone);

  const [
    listMemory,
    programRows,
    winPending,
    checkinToday,
    dailyPlanIntention,
    dailyLogsRaw,
    semanticFacts,
    northStarGoals,
    joyTank,
    pillarStatus,
    topRoutines,
    commitments,
    projectSummaries,
  ] = await Promise.all([
    loadListMemoryContext(input.userProfileId),
    loadUserProgramMemory(input.userProfileId),
    getWinConditionPending(input.userProfileId),
    loadTodayCheckin(input.userProfileId, local.dateKey),
    loadDailyPlanIntention(input.userProfileId, local.dateKey),
    loadRecentDailyLogs(input.userProfileId, MAX_LOG_SNIPPETS),
    loadSemanticFacts(input.userProfileId, 8),
    loadNorthStarGoals(input.userProfileId),
    loadJoyTank(input.userProfileId, local.dateKey),
    loadPillarStatus(input.userProfileId),
    loadTopRoutines(input.userProfileId),
    loadCommitments(input.userProfileId, local.dateKey, timezone, now),
    buildActiveProjectSummaries(input.userProfileId).catch(() => []),
  ]);

  const dailyLogs = dailyLogsRaw.map((log) => ({
    ...log,
    isToday: log.date === local.dateKey,
  }));
  const morningNotes = dailyLogs.filter((l) => l.isToday).map((l) => l.snippet);

  const learnings = programSectionBody(programRows, "program_learnings");
  const issues = parseMarkdownSectionBullets(learnings, "Not working / watch").slice(0, 5);
  const wins = parseMarkdownSectionBullets(learnings, "Working").slice(0, 3);

  const scheduleBody = programSectionBody(programRows, "weekly_schedule");
  const dayTone = inferDayFrameTone({
    scheduleBody,
    dayIndex,
    morningIntention: checkinToday.morningIntention,
    energyLevel: checkinToday.energyLevel,
    openCommitmentCount: commitments.today.length,
    overdueCount: commitments.overdueCount,
    dailyPlanIntention,
  });

  const slippingRoutines = buildSlippingRoutines({
    recentMissesByKey: commitments.recentMissesByKey,
    activityStats: topRoutines,
  });

  const errands = await loadErrands(input.userProfileId, commitments.today);

  const activeProjects = projectSummaries.slice(0, 4).map((p) => ({
    title: p.title,
    pillar: p.primary_pillar,
    status: p.status,
    projectType: p.project_type,
    targetDate: p.target_date,
    openChecklistCount: p.open_checklist_count,
    nextChecklistItem: p.next_checklist_item,
  }));

  const narrativeBullets = buildBehaviorNarrative({
    issues,
    wins,
    dailyLogSnippets: dailyLogs.map(({ date, snippet }) => ({ date, snippet })),
    semanticFacts,
    morningNotes,
  });

  const lists = listMemory.catalog.map((c) => ({
    slug: c.slug,
    displayName: c.displayName,
    openCount: c.openCount,
  }));

  return {
    localTime: {
      dateKey: local.dateKey,
      hour: local.hour,
      minute: local.minute,
      isLateEvening: isLateEveningHour(local.hour, LATE_EVENING_HOUR),
    },
    dayFrame: {
      tone: dayTone.tone,
      toneReason: dayTone.reason,
      morningIntention: checkinToday.morningIntention,
      energyLevel: checkinToday.energyLevel,
      feeling: checkinToday.feeling,
      dayRating: checkinToday.dayRating,
      weekPriorities: checkinToday.weekPriorities,
      dailyPlanIntention,
      morningNotes,
      winConditionPending: winPending
        ? { phase: winPending.phase, candidateText: winPending.candidateText }
        : undefined,
    },
    northStar: {
      statement: input.northStarGoal?.trim() || undefined,
      goals: northStarGoals,
    },
    operations: {
      todayCommitments: commitments.today,
      overdueCount: commitments.overdueCount,
      errands,
      slippingRoutines,
    },
    projects: {
      active: activeProjects,
      consistencyHint: projectConsistencyHint(activeProjects),
    },
    lists,
    listHighlights: listMemory.openHighlights.slice(0, 8).map((h) => ({
      slug: h.slug,
      title: h.title,
      status: h.status,
    })),
    behavior: {
      issues,
      wins,
      dailyLogSnippets: dailyLogs.map(({ date, snippet }) => ({ date, snippet })),
      narrativeBullets,
    },
    kpis: {
      joyTank,
      pillarStatus,
      topRoutines,
      consistencyHint: routineConsistencyHint(slippingRoutines),
    },
  };
}

// Re-export helpers used in tests
export {
  buildBehaviorNarrative,
  computeShowUpRate,
  isLateEveningHour,
} from "./growthHelpers.js";
