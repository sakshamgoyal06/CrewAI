/**
 * Redis-backed activity completion session — armed after post-activity proactive nudge.
 */
import { redis } from "../tools/clients.js";

const KEY_PREFIX = "activity_completion_pending:";
const NUDGE_PREFIX = "activity_completion_nudged:";
const TTL_SECONDS = 86400;

export type ActivityCompletionPhase = "awaiting_response" | "confirming";

export type ActivityCompletionOutcome = "done" | "missed" | "skipped" | "postponed";

export type ActivityCompletionDraft = {
  outcome?: ActivityCompletionOutcome;
  note?: string;
  newStartIso?: string;
};

export type ActivityCompletionPending = {
  phase: ActivityCompletionPhase;
  eventId: string;
  eventTitle: string;
  dateKey: string;
  timeZone: string;
  googleEventId?: string | null;
  draft: ActivityCompletionDraft;
  armedAt: string;
};

function pendingKey(userProfileId: string): string {
  return `${KEY_PREFIX}${userProfileId}`;
}

function nudgeKey(eventId: string): string {
  return `${NUDGE_PREFIX}${eventId}`;
}

export async function setActivityCompletionPending(
  userProfileId: string,
  pending: ActivityCompletionPending,
): Promise<void> {
  await redis.set(pendingKey(userProfileId), JSON.stringify(pending), { ex: TTL_SECONDS });
}

export async function getActivityCompletionPending(
  userProfileId: string,
): Promise<ActivityCompletionPending | null> {
  const raw = await redis.get<string>(pendingKey(userProfileId));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as ActivityCompletionPending;
    if (!parsed.eventId || !parsed.dateKey || !parsed.eventTitle) {
      return null;
    }
    if (parsed.phase !== "awaiting_response" && parsed.phase !== "confirming") {
      return null;
    }
    return {
      ...parsed,
      draft: parsed.draft ?? {},
      armedAt: parsed.armedAt ?? new Date().toISOString(),
      timeZone: parsed.timeZone ?? "UTC",
    };
  } catch {
    return null;
  }
}

export async function clearActivityCompletionPending(userProfileId: string): Promise<void> {
  await redis.del(pendingKey(userProfileId));
}

export async function markActivityCompletionNudged(eventId: string): Promise<void> {
  await redis.set(nudgeKey(eventId), "1", { ex: TTL_SECONDS });
}

export async function wasActivityCompletionNudged(eventId: string): Promise<boolean> {
  const raw = await redis.get<string>(nudgeKey(eventId));
  return raw === "1";
}

const CONFIRM_YES_RE =
  /^\s*(?:yes|yeah|yep|y|confirm|correct|that's right|thats right)\s*[.!]?\s*$/i;
const CONFIRM_NO_RE =
  /^\s*(?:no|nope|n|not\s*that|wrong|try\s*again|different|edit)\s*[.!]?\s*$/i;
const DECLINE_RE =
  /\b(?:skip(?:ping)?|not\s+now|maybe\s+later|don'?t\s+ask|stop\s+asking)\b/i;

export function isActivityCompletionConfirmYes(message: string): boolean {
  return CONFIRM_YES_RE.test(message.trim());
}

export function isActivityCompletionConfirmNo(message: string): boolean {
  return CONFIRM_NO_RE.test(message.trim());
}

export function isActivityCompletionDecline(message: string): boolean {
  return DECLINE_RE.test(message.trim());
}
