/**
 * When a user journals or reports completing something that the event log still shows as
 * planned/missed, close the matching row instead of leaving journal and log out of sync.
 */
import { listEvents, updateEvent } from "./eventStore.js";
import type { EventRow, EventStatus } from "./eventTypes.js";
import { logger } from "../logger.js";

const RECONCILABLE_STATUSES: EventStatus[] = ["planned", "in_progress", "missed"];

export type CompletionRule = {
  id: string;
  /** Note must match this (completion signal). */
  pattern: RegExp;
  /** Event title must match this. */
  titleMatch: RegExp;
  /** When present anywhere in the note, skip this rule (e.g. "haven't picked up"). */
  blockWhen?: RegExp;
};

/** Ordered: more specific rules first. */
export const EVENT_COMPLETION_RULES: CompletionRule[] = [
  {
    id: "bike_pickup",
    pattern: /\b(?:picked?\s+up|got\s+back|collected)\b.{0,40}\bbike\b|\bbike\b.{0,40}\b(?:picked?\s+up|back\s+home|servicing\s+done)\b/i,
    titleMatch: /\bbike\s+pickup\b/i,
    blockWhen: /\b(?:haven'?t|have\s+not|not\s+yet|still\s+need|without)\b.{0,40}\b(?:pick|picked)\b/i,
  },
  {
    id: "bike_drop",
    pattern: /\b(?:dropped?\s+off|dropped?|left)\b.{0,40}\bbike\b|\bbike\b.{0,40}\b(?:dropped?\s+off|for\s+servic)/i,
    titleMatch: /\b(?:drop|servic).*\bbike\b|\bbike\b.*\b(?:drop|servic)/i,
    blockWhen: /\b(?:haven'?t|have\s+not|not\s+yet|without)\b.{0,30}\b(?:drop|dropped)\b/i,
  },
  {
    id: "bike_service_done",
    pattern: /\b(?:bike\s+)?servic(?:e|ing)\s+done\b|\bservicing\s+done\b.{0,30}\bbike\b/i,
    titleMatch: /\bbike\b/i,
    blockWhen: /\b(?:haven'?t|have\s+not|not\s+yet|still\s+need)\b/i,
  },
  {
    id: "cleanup_done",
    pattern: /\b(?:cleaned?|cleanup\s+done|tidied)\b.{0,50}\b(?:home|room|space|cupboard|house)\b|\b(?:home|room|space)\b.{0,50}\b(?:cleaned?|tidied|mostly\s+clean)\b/i,
    titleMatch: /\b(?:cleanup|clean|cupboard|tidy)\b/i,
  },
  {
    id: "generic_done",
    pattern: /\b(?:done|finished|completed)\b/i,
    titleMatch: /.*/,
  },
];

export type ReconcileMatch = {
  eventId: string;
  title: string;
  ruleId: string;
  previousStatus: EventStatus;
};

function noteMatchesRule(note: string, rule: CompletionRule): boolean {
  if (rule.blockWhen?.test(note)) {
    return false;
  }
  return rule.pattern.test(note);
}

function eventMatchesRule(event: EventRow, rule: CompletionRule): boolean {
  return rule.titleMatch.test(event.title);
}

/**
 * Score how well an event title aligns with note text (for generic_done fallback).
 * Returns 0 when no meaningful overlap.
 */
function titleOverlapScore(note: string, title: string): number {
  const noteLower = note.toLowerCase();
  const tokens = title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
  if (tokens.length === 0) {
    return 0;
  }
  const hits = tokens.filter((t) => noteLower.includes(t));
  return hits.length / tokens.length;
}

export function findCompletionMatches(
  note: string,
  events: EventRow[],
  rules: CompletionRule[] = EVENT_COMPLETION_RULES,
): ReconcileMatch[] {
  const text = note.trim();
  if (!text) {
    return [];
  }

  const open = events.filter((e) => RECONCILABLE_STATUSES.includes(e.status) && !e.rescheduled_to);
  const matched: ReconcileMatch[] = [];
  const usedIds = new Set<string>();

  for (const rule of rules) {
    if (!noteMatchesRule(text, rule)) {
      continue;
    }
    for (const event of open) {
      if (usedIds.has(event.id)) {
        continue;
      }
      if (!eventMatchesRule(event, rule)) {
        continue;
      }
      if (rule.id === "generic_done" && titleOverlapScore(text, event.title) < 0.5) {
        continue;
      }
      matched.push({
        eventId: event.id,
        title: event.title,
        ruleId: rule.id,
        previousStatus: event.status,
      });
      usedIds.add(event.id);
    }
  }

  return matched;
}

export type ReconcileFromTextResult = {
  updated: Array<{ eventId: string; title: string; previousStatus: EventStatus }>;
  errors: string[];
};

export async function reconcileEventCompletionsFromText(input: {
  userProfileId: string;
  text: string;
  timeZone?: string;
  /** When the user says something happened on a prior day. */
  completedAt?: Date;
  outcomeNote?: string;
}): Promise<ReconcileFromTextResult> {
  const text = input.text.trim();
  if (!text) {
    return { updated: [], errors: [] };
  }

  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const rows = await listEvents({
    userProfileId: input.userProfileId,
    from,
    to,
    statuses: RECONCILABLE_STATUSES,
    includeUnscheduled: true,
    limit: 50,
  });

  if (!rows.ok) {
    return { updated: [], errors: [rows.error] };
  }

  const matches = findCompletionMatches(text, rows.data);
  const updated: ReconcileFromTextResult["updated"] = [];
  const errors: string[] = [];

  for (const match of matches) {
    const endedAt = input.completedAt ?? now;
    const result = await updateEvent({
      userProfileId: input.userProfileId,
      eventId: match.eventId,
      status: "done",
      outcomeNote: input.outcomeNote?.trim() || text.slice(0, 500),
      endedAt,
    });
    if (!result.ok) {
      errors.push(`${match.title}: ${result.error}`);
      logger.warn(
        { eventId: match.eventId, err: result.error, ruleId: match.ruleId },
        "event completion reconcile failed",
      );
      continue;
    }
    updated.push({
      eventId: match.eventId,
      title: match.title,
      previousStatus: match.previousStatus,
    });
    logger.info(
      { eventId: match.eventId, ruleId: match.ruleId, from: match.previousStatus },
      "event completion reconciled from text",
    );
  }

  return { updated, errors };
}

/** Reconcile from recent journal bodies before morning brief sweep. */
export async function reconcileFromRecentJournalLogs(input: {
  userProfileId: string;
  bodies: string[];
}): Promise<ReconcileFromTextResult> {
  const merged: ReconcileFromTextResult = { updated: [], errors: [] };
  const seen = new Set<string>();

  for (const body of input.bodies) {
    const result = await reconcileEventCompletionsFromText({
      userProfileId: input.userProfileId,
      text: body,
    });
    for (const row of result.updated) {
      if (!seen.has(row.eventId)) {
        merged.updated.push(row);
        seen.add(row.eventId);
      }
    }
    merged.errors.push(...result.errors);
  }

  return merged;
}

export function formatReconcileSummary(result: ReconcileFromTextResult): string | null {
  if (result.updated.length === 0) {
    return null;
  }
  const lines = result.updated.map(
    (u) => `"${u.title}" (${u.previousStatus} → done)`,
  );
  return `Event log reconciled: ${lines.join("; ")}.`;
}
