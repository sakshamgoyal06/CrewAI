/**
 * Unified daily logging status — single source of truth for proactive gating.
 */
import { supabase } from "../tools/clients.js";
import {
  hasEveningReflectionFields,
  hasMorningIntention,
  loadCheckinFields,
} from "./checkinFields.js";
import { isLoggingDeclined } from "./loggingDeclined.js";
import type { DailyLogCompleteness, DailyLogStatus } from "./types.js";

async function hasJournalNoteToday(userProfileId: string, dateKey: string): Promise<boolean> {
  const start = `${dateKey}T00:00:00.000Z`;
  const end = `${dateKey}T23:59:59.999Z`;

  const { data } = await supabase
    .from("magnus_daily_logs")
    .select("id, metadata")
    .eq("user_profile_id", userProfileId)
    .gte("created_at", start)
    .lte("created_at", end)
    .limit(5);

  if (!data?.length) {
    return false;
  }

  return data.some((row) => {
    const meta = row.metadata as Record<string, unknown> | null;
    return !meta?.health_journal;
  });
}

async function hasHealthJournalToday(userProfileId: string, dateKey: string): Promise<boolean> {
  const start = `${dateKey}T00:00:00.000Z`;
  const end = `${dateKey}T23:59:59.999Z`;

  const { data } = await supabase
    .from("magnus_daily_logs")
    .select("id")
    .eq("user_profile_id", userProfileId)
    .contains("metadata", { health_journal: true })
    .gte("created_at", start)
    .lte("created_at", end)
    .limit(1);

  return Boolean(data?.length);
}

function resolveCompleteness(input: {
  hasMorning: boolean;
  hasEvening: boolean;
  hasJournal: boolean;
  hasHealthJournal: boolean;
  declinedEvening: boolean;
}): DailyLogCompleteness {
  if (input.declinedEvening && !input.hasEvening) {
    return "declined";
  }
  if (input.hasEvening && (input.hasMorning || input.hasJournal || input.hasHealthJournal)) {
    return "complete";
  }
  if (input.hasEvening) {
    return "complete";
  }
  if (input.hasMorning && !input.hasEvening) {
    return "morning_only";
  }
  if ((input.hasJournal || input.hasHealthJournal) && !input.hasMorning && !input.hasEvening) {
    return "journal_only";
  }
  if (input.hasMorning || input.hasJournal || input.hasHealthJournal) {
    return "partial";
  }
  return "empty";
}

export async function loadDailyLogStatus(input: {
  userProfileId: string;
  dateKey: string;
  localHour?: number;
}): Promise<DailyLogStatus> {
  const [checkin, hasJournal, hasHealthJournal, declinedEvening] = await Promise.all([
    loadCheckinFields(input.userProfileId, input.dateKey),
    hasJournalNoteToday(input.userProfileId, input.dateKey),
    hasHealthJournalToday(input.userProfileId, input.dateKey),
    isLoggingDeclined(input.userProfileId, input.dateKey, "evening"),
  ]);

  const hasMorning = hasMorningIntention(checkin);
  const hasEvening =
    hasEveningReflectionFields(checkin) || hasHealthJournal || (hasJournal && !hasMorning);

  const completeness = resolveCompleteness({
    hasMorning,
    hasEvening,
    hasJournal,
    hasHealthJournal,
    declinedEvening,
  });

  const hour = input.localHour ?? 12;
  const isEveningWindow = hour >= 19 && hour < 23;
  const isFollowUpWindow = hour >= 22 && hour < 23;

  const shouldNudgeEvening =
    isEveningWindow &&
    !declinedEvening &&
    !hasEvening &&
    completeness !== "complete";

  const shouldFollowUpEvening =
    isFollowUpWindow &&
    !declinedEvening &&
    !hasEvening &&
    completeness !== "complete";

  return {
    dateKey: input.dateKey,
    completeness,
    hasMorningIntention: hasMorning,
    hasEveningReflection: hasEvening,
    hasJournalNote: hasJournal,
    hasHealthJournal,
    morningIntention: checkin.morningIntention,
    dayRating: checkin.dayRating,
    joyScore: checkin.joyScore,
    feeling: checkin.feeling,
    checkinNotes: checkin.notes,
    declinedEvening,
    shouldNudgeEvening,
    shouldFollowUpEvening,
  };
}
