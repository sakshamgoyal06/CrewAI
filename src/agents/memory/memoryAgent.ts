/**
 * Memory agent — tiered Supabase-backed context for Magnus and specialists (not end-user facing).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Intent } from "../../intent.js";
import { lifeosContextEnabled } from "../../config/lifeosContext.js";
import { logger } from "../../logger.js";
import { supabase as defaultSupabase } from "../../tools/clients.js";
import type { MemoryContext, MemoryPurpose } from "./types.js";
import { memoryConfig } from "./memoryConfig.js";
export { formatMemoryBlockForSystem, augmentUserWithMemory } from "./format.js";
export { buildAgentMessages, buildAgentHistoryPrefix } from "./buildAgentMessages.js";
export { buildMemoryPackage } from "./memoryPackage.js";
export type { MemoryPackage } from "./memoryPackage.js";
export {
  formatUserKnowledgeBlock,
  loadUserKnowledgeLayer,
  userKnowledgeEnabled,
} from "./userKnowledge.js";
export { runPostTurnMemoryMaintenance, chronologicalTurnsFromPackage } from "./postTurnMemory.js";
export { memoryConfig, resetMemoryConfigForTests } from "./memoryConfig.js";
export type { MemoryConfig } from "./memoryConfig.js";
export type {
  MemoryContext,
  MemoryPurpose,
  MemoryChatTurn,
  MemoryGoalRow,
  MemoryDailyLogEntry,
  MemoryEventEntry,
} from "./types.js";

const log = logger.child({ module: "memoryAgent" });

const CHAT_LIMIT: Record<MemoryPurpose, number> = {
  chat: 24,
  brief: 12,
  pattern: 48,
};

function chatFetchLimit(purpose: MemoryPurpose): number {
  const config = memoryConfig();
  if (config.chatFetchLimit > 0) {
    return Math.max(config.chatFetchLimit, config.verbatimTurnLimit);
  }
  return CHAT_LIMIT[purpose];
}

function truncateContent(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) {
    return t;
  }
  return `${t.slice(0, max)}…`;
}

function shortProfileIdForLogs(id: string): string {
  if (id.length <= 12) {
    return id;
  }
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

export function intentToMemoryPurpose(intent: Intent): MemoryPurpose {
  if (intent === "HAPPINESS") {
    return "pattern";
  }
  if (intent === "GENERAL" || intent === "HEALTH") {
    return "chat";
  }
  return "brief";
}

type LoadDeps = {
  supabase?: SupabaseClient;
};

async function safeTableQuery<T>(
  label: string,
  run: () => PromiseLike<{
    data: T | null;
    error: { message: string; code?: string } | null;
  }>,
): Promise<{ ok: true; data: T } | { ok: false; gap: string }> {
  try {
    const { data, error } = await run();
    if (error) {
      return { ok: false, gap: `${label}: ${error.message}` };
    }
    return { ok: true, data: data as T };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, gap: `${label}: ${msg}` };
  }
}

export async function loadMemoryContext(input: {
  userProfileId: string;
  telegramUserId: string;
  purpose: MemoryPurpose;
  deps?: LoadDeps;
}): Promise<MemoryContext> {
  const sb = input.deps?.supabase ?? defaultSupabase;
  const gaps: string[] = [];
  const loadedAt = new Date().toISOString();

  const profileResult = await safeTableQuery<Record<string, unknown> | null>(
    "user_profile",
    async () =>
      await sb
        .from("user_profile")
        .select("north_star_goal, timezone, user_tier, display_name")
        .eq("id", input.userProfileId)
        .maybeSingle(),
  );

  let profile: MemoryContext["profile"] = null;
  if (!profileResult.ok) {
    gaps.push(profileResult.gap);
  } else if (profileResult.data && typeof profileResult.data === "object") {
    const row = profileResult.data;
    profile = {
      northStarGoal:
        typeof row.north_star_goal === "string" ? row.north_star_goal : undefined,
      timezone: typeof row.timezone === "string" ? row.timezone : undefined,
      userTier: typeof row.user_tier === "string" ? row.user_tier : undefined,
      displayName: typeof row.display_name === "string" ? row.display_name : undefined,
    };
  } else {
    gaps.push("user_profile: no row for id");
  }

  const chatLimit = chatFetchLimit(input.purpose);
  const turnMax = memoryConfig().turnContentMaxChars;
  const chatResult = await safeTableQuery<
    Array<{
      role: string;
      content: string | null;
      intent: string | null;
      created_at: string | null;
    }>
  >("magnus_chat_messages", async () =>
    await sb
      .from("magnus_chat_messages")
      .select("role, content, intent, created_at")
      .eq("user_profile_id", input.userProfileId)
      .eq("telegram_user_id", input.telegramUserId)
      .order("created_at", { ascending: false })
      .limit(chatLimit),
  );

  const recentChatTurns: MemoryContext["recentSignals"]["recentChatTurns"] = [];
  if (!chatResult.ok) {
    gaps.push(chatResult.gap);
  } else {
    const rows = chatResult.data ?? [];
    for (const row of rows) {
      const role = row.role;
      if (role !== "user" && role !== "assistant" && role !== "system") {
        continue;
      }
      const content = typeof row.content === "string" ? row.content : "";
      recentChatTurns.push({
        role,
        content: truncateContent(content, turnMax),
        intent: row.intent ?? null,
        createdAt: row.created_at ?? loadedAt,
      });
    }
    recentChatTurns.reverse();
  }

  const rollingSummaries: MemoryContext["rollingSummaries"] = {};
  const memSum = await safeTableQuery<
    Array<{ summary_text?: string; period?: string; window_days?: number; created_at?: string }>
  >("memory_summaries", async () =>
    await sb
      .from("memory_summaries")
      .select("summary_text, period, window_days, created_at")
      .eq("user_profile_id", input.userProfileId)
      .order("created_at", { ascending: false })
      .limit(12),
  );
  if (!memSum.ok) {
    gaps.push(memSum.gap);
  } else {
    const rows = memSum.data ?? [];
    if (rows.length === 0) {
      gaps.push("memory_summaries: no rows (or table empty)");
    }
    for (const r of rows) {
      const w = r.window_days ?? (r.period === "7d" ? 7 : r.period === "30d" ? 30 : undefined);
      const text = typeof r.summary_text === "string" ? r.summary_text : "";
      if (w === 7 && !rollingSummaries.summary7d && text) {
        rollingSummaries.summary7d = text;
      }
      if (w === 30 && !rollingSummaries.summary30d && text) {
        rollingSummaries.summary30d = text;
      }
    }
    if (!rollingSummaries.summary7d && !rollingSummaries.summary30d && rows.length > 0) {
      const first = rows[0];
      const t = typeof first?.summary_text === "string" ? first.summary_text : "";
      if (t) {
        rollingSummaries.summary7d = t.slice(0, 800);
      }
    }
  }

  let dailyScoresRows: Array<Record<string, unknown>> = [];
  if (lifeosContextEnabled()) {
    const dailyScores = await safeTableQuery<Array<Record<string, unknown>>>(
      "daily_scores",
      async () =>
        await sb
          .from("daily_scores")
          .select("*")
          .eq("user_profile_id", input.userProfileId)
          .order("date", { ascending: false })
          .limit(5),
    );
    if (!dailyScores.ok) {
      gaps.push(dailyScores.gap);
    } else {
      dailyScoresRows = dailyScores.data ?? [];
      if (dailyScoresRows.length === 0) {
        gaps.push("daily_scores: no recent rows");
      }
    }
  }

  let dailyLogsRows: MemoryContext["recentSignals"]["dailyLogs"];
  const dailyLogsQ = await safeTableQuery<
    Array<{
      body?: string | null;
      log_date?: string | null;
      source?: string | null;
      created_at?: string | null;
    }>
  >("magnus_daily_logs", async () =>
    await sb
      .from("magnus_daily_logs")
      .select("body, log_date, source, created_at")
      .eq("user_profile_id", input.userProfileId)
      .order("created_at", { ascending: false })
      .limit(8),
  );
  if (!dailyLogsQ.ok) {
    gaps.push(dailyLogsQ.gap);
    dailyLogsRows = undefined;
  } else {
    const raw = dailyLogsQ.data ?? [];
    if (raw.length === 0) {
      gaps.push("magnus_daily_logs: no recent rows");
    }
    dailyLogsRows = raw.map((r) => ({
      body: typeof r.body === "string" ? truncateContent(r.body, 1500) : "",
      logDate: typeof r.log_date === "string" ? r.log_date : "",
      source: typeof r.source === "string" ? r.source : undefined,
      createdAt: typeof r.created_at === "string" ? r.created_at : loadedAt,
    }));
  }

  // A window either side of now: yesterday says what slipped, the next two days say what is on.
  let eventRows: MemoryContext["recentSignals"]["events"];
  const eventWindowStart = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const eventWindowEnd = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const eventsQ = await safeTableQuery<
    Array<{
      title?: string | null;
      status?: string | null;
      pillar?: string | null;
      planned_start_at?: string | null;
      time_zone?: string | null;
      all_day?: boolean | null;
      reschedule_count?: number | null;
      reason?: string | null;
    }>
  >("magnus_events", async () =>
    await sb
      .from("magnus_events")
      .select("title, status, pillar, planned_start_at, time_zone, all_day, reschedule_count, reason")
      .eq("user_profile_id", input.userProfileId)
      .gte("planned_start_at", eventWindowStart)
      .lte("planned_start_at", eventWindowEnd)
      .order("planned_start_at", { ascending: true })
      .limit(memoryConfig().eventsInBlock * 2),
  );
  if (!eventsQ.ok) {
    gaps.push(eventsQ.gap);
  } else {
    const raw = eventsQ.data ?? [];
    eventRows = raw
      .filter((r) => typeof r.title === "string" && r.title.trim())
      .map((r) => ({
        title: truncateContent(r.title ?? "", 120),
        status: r.status ?? "planned",
        pillar: r.pillar ?? undefined,
        plannedStartAt: r.planned_start_at ?? undefined,
        timeZone: r.time_zone ?? undefined,
        allDay: r.all_day ?? false,
        moves: r.reschedule_count ?? 0,
        reason: r.reason ? truncateContent(r.reason, 160) : undefined,
      }));
  }

  const activeGoals: MemoryContext["activeGoals"] = [];
  if (lifeosContextEnabled()) {
    const goalsQ = await safeTableQuery<Array<Record<string, unknown> & { id?: string }>>(
      "goals",
      async () =>
        await sb
          .from("goals")
          .select("*")
          .eq("user_profile_id", input.userProfileId)
          .eq("status", "active")
          .limit(12),
    );
    if (!goalsQ.ok) {
      gaps.push(goalsQ.gap);
    } else {
      for (const g of goalsQ.data ?? []) {
        const id = typeof g.id === "string" ? g.id : "";
        const label =
          (typeof g.title === "string" && g.title) ||
          (typeof g.name === "string" && g.name) ||
          (typeof g.description === "string" && g.description.slice(0, 120)) ||
          id ||
          "goal";
        activeGoals.push({
          id: id || label,
          label: truncateContent(label, 200),
          pillar: typeof g.pillar === "string" ? g.pillar : undefined,
          status: typeof g.status === "string" ? g.status : undefined,
          timeframe: typeof g.timeframe === "string" ? g.timeframe : undefined,
        });
      }
    }
  }

  const joy: MemoryContext["joy"] = {};
  if (lifeosContextEnabled()) {
    const hr = await safeTableQuery<Record<string, unknown> | null>(
      "happiness_reserve",
      async () =>
        await sb
          .from("happiness_reserve")
          .select("*")
          .eq("user_profile_id", input.userProfileId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
    );
    if (!hr.ok) {
      gaps.push(hr.gap);
    } else if (hr.data && typeof hr.data === "object") {
      joy.happinessReserve = hr.data as Record<string, unknown>;
      const tank =
        typeof hr.data.tank_level === "number"
          ? hr.data.tank_level
          : typeof hr.data.happiness_score === "number"
            ? hr.data.happiness_score
            : undefined;
      if (tank !== undefined) {
        joy.summary = `Joy tank / reserve signal (numeric): ${tank}`;
      } else {
        joy.summary = "Joy / happiness reserve row present (see raw).";
      }
    }
  }

  const happinessChatHints =
    recentChatTurns.filter((t) => t.intent === "HAPPINESS").length > 0;
  if (!joy.summary && happinessChatHints) {
    joy.summary = "Recent HAPPINESS-tagged chat turns present (no happiness_reserve row loaded).";
  }

  const patterns: MemoryContext["patterns"] = [];
  if (lifeosContextEnabled()) {
    const pat = await safeTableQuery<Array<Record<string, unknown>>>(
      "patterns",
      async () =>
        await sb
          .from("patterns")
          .select("*")
          .eq("user_profile_id", input.userProfileId)
          .order("created_at", { ascending: false })
          .limit(8),
    );
    if (!pat.ok) {
      gaps.push(pat.gap);
    } else {
      patterns.push(...(pat.data ?? []));
    }
  }

  let lists: MemoryContext["lists"];
  try {
    const { loadListMemoryContext } = await import("../../lists/listMemory.js");
    const listCtx = await loadListMemoryContext(input.userProfileId);
    lists = {
      notionConnected: listCtx.notionConnected,
      catalog: listCtx.catalog,
      openHighlights: listCtx.openHighlights,
    };
    if (activeGoals.length === 0) {
      for (const g of listCtx.openHighlights.filter((h) => h.slug === "goals")) {
        activeGoals.push({
          id: g.title,
          label: g.title,
          status: g.status,
        });
      }
    }
  } catch (e) {
    gaps.push(`lists: ${e instanceof Error ? e.message : String(e)}`);
  }

  const ctx: MemoryContext = {
    purpose: input.purpose,
    loadedAt,
    profile,
    recentSignals: {
      recentChatTurns,
      ...(dailyScoresRows.length > 0 ? { dailyScores: dailyScoresRows } : {}),
      ...(dailyLogsRows && dailyLogsRows.length > 0 ? { dailyLogs: dailyLogsRows } : {}),
      ...(eventRows && eventRows.length > 0 ? { events: eventRows } : {}),
    },
    rollingSummaries,
    activeGoals,
    joy,
    patterns,
    ...(lists ? { lists } : {}),
    gaps,
  };

  log.debug(
    {
      purpose: ctx.purpose,
      profileId: shortProfileIdForLogs(input.userProfileId),
      gapCount: ctx.gaps.length,
      recentTurnCount: ctx.recentSignals.recentChatTurns.length,
      goalCount: ctx.activeGoals.length,
      patternCount: ctx.patterns.length,
    },
    "memory context loaded",
  );

  return ctx;
}

