/**
 * Pending morning win-condition confirmation after the Morning Brief intention question.
 */
import { redis } from "../tools/clients.js";

const KEY_PREFIX = "win_condition_pending:";
const TTL_SECONDS = 86400;

export type WinConditionPendingPhase = "collecting" | "confirming";

export type WinConditionPending = {
  phase: WinConditionPendingPhase;
  candidateText?: string;
};

function key(userProfileId: string): string {
  return `${KEY_PREFIX}${userProfileId}`;
}

export async function setWinConditionPending(
  userProfileId: string,
  pending: WinConditionPending,
): Promise<void> {
  await redis.set(key(userProfileId), JSON.stringify(pending), { ex: TTL_SECONDS });
}

export async function getWinConditionPending(
  userProfileId: string,
): Promise<WinConditionPending | null> {
  const raw = await redis.get<string>(key(userProfileId));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as WinConditionPending;
    if (parsed.phase !== "collecting" && parsed.phase !== "confirming") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function clearWinConditionPending(userProfileId: string): Promise<void> {
  await redis.del(key(userProfileId));
}

const CONFIRM_YES_RE =
  /^\s*(?:yes|yeah|yep|y|confirm|log\s*it|save\s*it|please\s*log|that's\s*it|thats\s*it)\s*[.!]?\s*$/i;
const CONFIRM_NO_RE =
  /^\s*(?:no|nope|n|not\s*that|wrong|try\s*again|different)\s*[.!]?\s*$/i;

const DECLINE_RE =
  /\b(?:don'?t|do\s*not)\s+want\s+to\s+log(?:\s+(?:a|today'?s?))?\s*win\b|\bskip(?:ping)?\s+(?:today'?s?\s+)?win\b|\bno\s+win\s+(?:for\s+)?today\b|\bnot\s+logging\s+(?:a\s+)?win\b|\bno\s+win\s+condition\b/i;

export function isWinConditionConfirmYes(message: string): boolean {
  return CONFIRM_YES_RE.test(message.trim());
}

export function isWinConditionConfirmNo(message: string): boolean {
  return CONFIRM_NO_RE.test(message.trim());
}

export function isWinConditionDecline(message: string): boolean {
  return DECLINE_RE.test(message.trim());
}

export function formatWinConditionConfirmPrompt(candidateText: string): string {
  return (
    `Log this as today's win condition?\n\n` +
    `**${candidateText.trim()}**\n\n` +
    `Reply **yes** to save it, **no** to send a different win, or say you're skipping today's win.`
  );
}

export function formatWinConditionCollectPrompt(): string {
  return (
    "What's the one thing that would make today a win? Reply with your answer — " +
    "I'll ask before saving it. (Or say you're skipping today's win.)"
  );
}
