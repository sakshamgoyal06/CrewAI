/**
 * Per-day explicit declines — prevents repeat nudges when the user skips logging.
 */
import { redis } from "../tools/clients.js";

const KEY_PREFIX = "logging_declined:";
const TTL_SECONDS = 86400;

export type LoggingDeclineKind = "evening" | "morning";

function key(userProfileId: string, dateKey: string, kind: LoggingDeclineKind): string {
  return `${KEY_PREFIX}${kind}:${userProfileId}:${dateKey}`;
}

export async function setLoggingDeclined(
  userProfileId: string,
  dateKey: string,
  kind: LoggingDeclineKind,
): Promise<void> {
  await redis.set(key(userProfileId, dateKey, kind), "1", { ex: TTL_SECONDS });
}

export async function isLoggingDeclined(
  userProfileId: string,
  dateKey: string,
  kind: LoggingDeclineKind,
): Promise<boolean> {
  const raw = await redis.get<string>(key(userProfileId, dateKey, kind));
  return raw === "1";
}
