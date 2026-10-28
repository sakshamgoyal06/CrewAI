/**
 * Daily logging framework — unified status and session states.
 *
 * Magnus tracks three surfaces per calendar day:
 * - Structured check-in (`checkins` list): morning intention, scores, evening reflection
 * - Free-form journal (`magnus_daily_logs` via `log_note`)
 * - Health EOD journal (`magnus_daily_logs` with `health_journal: true`)
 */

/** How complete today's logging is — drives proactive nudge decisions. */
export type DailyLogCompleteness =
  | "empty"
  | "morning_only"
  | "journal_only"
  | "partial"
  | "complete"
  | "declined";

export type DailyLogStatus = {
  dateKey: string;
  completeness: DailyLogCompleteness;
  hasMorningIntention: boolean;
  hasEveningReflection: boolean;
  hasJournalNote: boolean;
  hasHealthJournal: boolean;
  morningIntention?: string;
  dayRating?: string;
  joyScore?: number;
  feeling?: string;
  checkinNotes?: string;
  /** User explicitly skipped evening logging today. */
  declinedEvening: boolean;
  /** Safe to send the primary evening journal nudge (~21:00). */
  shouldNudgeEvening: boolean;
  /** Safe to send a single gentle follow-up (~22:00) if session still open. */
  shouldFollowUpEvening: boolean;
};

/** Redis-backed evening journal session after proactive nudge or user-initiated log. */
export type EveningJournalPhase = "awaiting_engagement" | "collecting" | "confirming";

export type EveningJournalDraft = {
  day_rating?: number;
  joy_score?: number;
  feeling?: string;
  notes?: string;
};

export type EveningJournalPending = {
  phase: EveningJournalPhase;
  dateKey: string;
  draft: EveningJournalDraft;
  /** ISO timestamp when the session was armed (for follow-up timing). */
  armedAt: string;
};

export type EveningJournalTurnResult =
  | { handled: false }
  | { handled: true; replyText: string; metadata: Record<string, unknown> };
