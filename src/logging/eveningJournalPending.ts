/**
 * Redis-backed evening journal session — armed after proactive nudge or user-initiated log.
 */
import { redis } from "../tools/clients.js";
import type { EveningJournalPending, EveningJournalPhase } from "./types.js";

const KEY_PREFIX = "evening_journal_pending:";
const TTL_SECONDS = 86400;

function key(userProfileId: string): string {
  return `${KEY_PREFIX}${userProfileId}`;
}

export async function setEveningJournalPending(
  userProfileId: string,
  pending: EveningJournalPending,
): Promise<void> {
  await redis.set(key(userProfileId), JSON.stringify(pending), { ex: TTL_SECONDS });
}

export async function getEveningJournalPending(
  userProfileId: string,
): Promise<EveningJournalPending | null> {
  const raw = await redis.get<string>(key(userProfileId));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as EveningJournalPending;
    const validPhases: EveningJournalPhase[] = [
      "awaiting_engagement",
      "collecting",
      "confirming",
    ];
    if (!validPhases.includes(parsed.phase)) {
      return null;
    }
    if (!parsed.dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.dateKey)) {
      return null;
    }
    return {
      phase: parsed.phase,
      dateKey: parsed.dateKey,
      draft: parsed.draft ?? {},
      armedAt: parsed.armedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function clearEveningJournalPending(userProfileId: string): Promise<void> {
  await redis.del(key(userProfileId));
}

const CONFIRM_YES_RE =
  /^\s*(?:yes|yeah|yep|y|confirm|log\s*it|save\s*it|please\s*log|that's\s*it|thats\s*it)\s*[.!]?\s*$/i;
const CONFIRM_NO_RE =
  /^\s*(?:no|nope|n|not\s*that|wrong|try\s*again|different|edit)\s*[.!]?\s*$/i;

const DECLINE_RE =
  /\b(?:skip(?:ping)?|not\s+tonight|no\s+journal|don'?t\s+want\s+to\s+log|not\s+logging|maybe\s+later|tomorrow)\b/i;

export function isEveningJournalConfirmYes(message: string): boolean {
  return CONFIRM_YES_RE.test(message.trim());
}

export function isEveningJournalConfirmNo(message: string): boolean {
  return CONFIRM_NO_RE.test(message.trim());
}

export function isEveningJournalDecline(message: string): boolean {
  return DECLINE_RE.test(message.trim());
}
