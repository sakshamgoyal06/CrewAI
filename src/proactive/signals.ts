/**
 * Signal snapshot for proactive evaluation and LLM gate/compose.
 */
import { loadUserKnowledgeLayer } from "../agents/memory/userKnowledge.js";
import { getLocalTimeParts, type LocalTimeParts } from "../jobs/morningBriefTime.js";
import { fetchCheckinItem, fetchListBySlug } from "../lists/listStore.js";
import { supabase } from "../tools/clients.js";
import { loadUserIntegrations } from "../users/userIntegrations.js";
import {
  loadUserProgramMemory,
  type ProgramMemorySection,
} from "../users/userProgramMemory.js";

export type ProactiveSignalSnapshot = {
  now: Date;
  timezone: string;
  local: LocalTimeParts;
  hasCheckinToday: boolean;
  hevyConnected: boolean;
  gymPlannedToday: boolean;
  workoutLoggedToday: boolean;
  recentUserChatSnippet: string;
  userGraphSummary: string;
  weeklyScheduleExcerpt: string;
  programWatchExcerpt: string;
};

function localWeekdayIndex(now: Date, timezone: string): number {
  const short = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" })
    .format(now)
    .toLowerCase()
    .slice(0, 3);
  const map: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  return map[short] ?? new Date(now).getUTCDay();
}

function programSection(
  rows: Array<{ section: ProgramMemorySection; body: string }>,
  section: ProgramMemorySection,
): string {
  return rows.find((r) => r.section === section)?.body ?? "";
}

function isGymDayInSchedule(scheduleBody: string, dayIndex: number): boolean {
  const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  const dayName = dayNames[dayIndex];
  if (!scheduleBody.trim()) {
    return false;
  }
  for (const line of scheduleBody.split("\n")) {
    const lower = line.toLowerCase();
    if (!lower.includes(dayName)) {
      continue;
    }
    if (
      /\b(push|pull|legs|cardio|gym|workout|abs|swim)\b/i.test(line) &&
      !/\brest\b/i.test(line)
    ) {
      return true;
    }
  }
  return false;
}

async function hasCheckinForDate(userProfileId: string, dateKey: string): Promise<boolean> {
  const list = await fetchListBySlug(userProfileId, "checkins");
  if (!list.ok || !list.data) {
    return false;
  }
  const item = await fetchCheckinItem(userProfileId, list.data.id, dateKey);
  return Boolean(item.ok && item.data);
}

async function hasWorkoutToday(userProfileId: string, dateKey: string): Promise<boolean> {
  const start = `${dateKey}T00:00:00.000Z`;
  const end = `${dateKey}T23:59:59.999Z`;

  const { data: logs } = await supabase
    .from("magnus_daily_logs")
    .select("id")
    .eq("user_profile_id", userProfileId)
    .contains("metadata", { health_journal: true })
    .gte("created_at", start)
    .lte("created_at", end)
    .limit(1);

  if (logs && logs.length > 0) {
    return true;
  }

  const { data: events } = await supabase
    .from("magnus_events")
    .select("id")
    .eq("user_profile_id", userProfileId)
    .eq("status", "done")
    .gte("completed_at", start)
    .lte("completed_at", end)
    .limit(1);

  return Boolean(events && events.length > 0);
}

async function recentUserChatSnippet(
  userProfileId: string,
  telegramChatId: string,
): Promise<string> {
  const { data } = await supabase
    .from("magnus_chat_messages")
    .select("content")
    .eq("user_profile_id", userProfileId)
    .eq("telegram_user_id", telegramChatId)
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(3);

  if (!data?.length) {
    return "";
  }
  return data
    .map((r) => String(r.content ?? "").trim())
    .filter(Boolean)
    .join(" | ")
    .slice(0, 400);
}

export async function buildProactiveSignals(input: {
  userProfileId: string;
  telegramChatId: string;
  timezone: string;
  now: Date;
}): Promise<ProactiveSignalSnapshot> {
  const local = getLocalTimeParts(input.now, input.timezone);
  const dayIndex = localWeekdayIndex(input.now, input.timezone);

  const [integrations, programRows, knowledge, checkin, workout, chat] = await Promise.all([
    loadUserIntegrations(input.userProfileId),
    loadUserProgramMemory(input.userProfileId),
    loadUserKnowledgeLayer(input.userProfileId),
    hasCheckinForDate(input.userProfileId, local.dateKey),
    hasWorkoutToday(input.userProfileId, local.dateKey),
    recentUserChatSnippet(input.userProfileId, input.telegramChatId),
  ]);

  const weeklySchedule = programSection(programRows, "weekly_schedule");
  const learnings = programSection(programRows, "program_learnings");
  const watchMatch = learnings.match(/##\s*Not working\s*\/\s*watch\s*\n([\s\S]*?)(?=\n##\s|$)/i);

  const graph = knowledge.userGraph;
  const userGraphSummary = [
    graph.recentIssues.length
      ? `Issues: ${graph.recentIssues
          .map((i) => i.text)
          .slice(0, 3)
          .join("; ")}`
      : "",
    graph.recentWins.length
      ? `Wins: ${graph.recentWins
          .map((i) => i.text)
          .slice(0, 2)
          .join("; ")}`
      : "",
    graph.identifiedPatterns.length
      ? `Patterns: ${graph.identifiedPatterns
          .map((i) => i.text)
          .slice(0, 2)
          .join("; ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    now: input.now,
    timezone: input.timezone,
    local,
    hasCheckinToday: checkin,
    hevyConnected: Boolean(integrations.hevyApiKey),
    gymPlannedToday: isGymDayInSchedule(weeklySchedule, dayIndex),
    workoutLoggedToday: workout,
    recentUserChatSnippet: chat,
    userGraphSummary,
    weeklyScheduleExcerpt: weeklySchedule.slice(0, 600),
    programWatchExcerpt: watchMatch?.[1]?.slice(0, 500) ?? "",
  };
}
