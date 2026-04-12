/**
 * Telegram inline "department" picks: user taps a lane, then sends plain text.
 * We merge the next message into `/<commandKey> <text>` before routing.
 */
import { parseSlashCommand } from "../agents/routing/slashCommands.js";
import { redis } from "./clients.js";

const PENDING_KEY_PREFIX = "magnus:pending_slash:";
const PENDING_TTL_SEC = 600;

function pendingKey(telegramUserId: string): string {
  return `${PENDING_KEY_PREFIX}${telegramUserId}`;
}

export async function setPendingSlashCommand(
  telegramUserId: string,
  commandKey: string,
): Promise<void> {
  await redis.set(pendingKey(telegramUserId), commandKey, { ex: PENDING_TTL_SEC });
}

export async function getPendingSlashCommand(
  telegramUserId: string,
): Promise<string | null> {
  const v = await redis.get<string>(pendingKey(telegramUserId));
  return typeof v === "string" && v.length > 0 ? v : null;
}

export async function clearPendingSlashCommand(telegramUserId: string): Promise<void> {
  await redis.del(pendingKey(telegramUserId));
}

/**
 * If the user sent a known `/command` or any `/`-prefixed message, pending state is cleared.
 * Otherwise, if the user had pending from an inline keyboard pick, merge into
 * `/<commandKey> <their text>`.
 */
export async function mergePendingSlashIntoMessage(
  telegramUserId: string,
  text: string,
): Promise<string> {
  const trimmed = text.trim();
  if (parseSlashCommand(trimmed)) {
    await clearPendingSlashCommand(telegramUserId);
    return text;
  }
  if (trimmed.startsWith("/")) {
    await clearPendingSlashCommand(telegramUserId);
    return text;
  }
  const pending = await getPendingSlashCommand(telegramUserId);
  if (!pending) {
    return text;
  }
  if (trimmed.length === 0) {
    return text;
  }
  await clearPendingSlashCommand(telegramUserId);
  return `/${pending} ${trimmed}`;
}
