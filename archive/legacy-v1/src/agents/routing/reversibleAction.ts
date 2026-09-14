/**
 * Turn-scoped reversible actions — undo / confirm without disambiguation lists.
 * Pattern: same Redis prelude as win-condition pending.
 */
import { redis } from "../../tools/clients.js";

const KEY_PREFIX = "reversible_action:";
const TTL_SECONDS = 86400;

export type ReversibleActionKind = "meal_undo" | "list_item_undo";

export type ReversibleAction = {
  kind: ReversibleActionKind;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

function key(userProfileId: string): string {
  return `${KEY_PREFIX}${userProfileId}`;
}

export async function registerReversibleAction(
  userProfileId: string,
  action: ReversibleAction,
): Promise<void> {
  await redis.set(key(userProfileId), JSON.stringify(action), { ex: TTL_SECONDS });
}

export async function getReversibleAction(
  userProfileId: string,
): Promise<ReversibleAction | null> {
  const raw = await redis.get<string>(key(userProfileId));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as ReversibleAction;
    if (!parsed.kind || !parsed.summary) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function clearReversibleAction(userProfileId: string): Promise<void> {
  await redis.del(key(userProfileId));
}

const UNDO_RE = /^\s*undo(?:\s+this)?\.?\s*$/i;

export function isUndoRequest(message: string): boolean {
  return UNDO_RE.test(message.trim());
}
