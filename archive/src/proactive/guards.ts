import { getLocalTimeParts } from "../jobs/morningBriefTime.js";
import { claimProactiveDelivery } from "./dedupe.js";
import type { ProactiveCapBucket } from "./subscriptions/types.js";
import { redis } from "../tools/clients.js";

const ADAPTIVE_CAP_PER_DAY = 3;
const ADAPTIVE_CAP_PREFIX = "magnus:proactive:adaptive_cap:";

export type ProactiveGuardInput = {
  now: Date;
  timezone: string;
  userProfileId: string;
  capBucket: ProactiveCapBucket;
  /** User one-shots explicitly timed in quiet hours may still fire. */
  allowQuietHoursOverride?: boolean;
  dedupeKey: string;
  dedupeTtlSec: number;
  cooldownHours?: number | null;
  lastSentAt?: string | null;
};

export type ProactiveGuardResult =
  | { ok: true }
  | { ok: false; reason: string };

/** Quiet hours: 23:00–06:00 in user local time. */
export function inQuietHours(now: Date, timezone: string): boolean {
  const { hour } = getLocalTimeParts(now, timezone);
  return hour >= 23 || hour < 6;
}

export async function checkAdaptiveCap(
  userProfileId: string,
  dateKey: string,
): Promise<{ allowed: boolean; count: number }> {
  const key = `${ADAPTIVE_CAP_PREFIX}${userProfileId}:${dateKey}`;
  const raw = await redis.get<string>(key);
  const count = raw ? Number.parseInt(String(raw), 10) : 0;
  if (Number.isNaN(count)) {
    return { allowed: true, count: 0 };
  }
  return { allowed: count < ADAPTIVE_CAP_PER_DAY, count };
}

export async function incrementAdaptiveCap(
  userProfileId: string,
  dateKey: string,
): Promise<void> {
  const key = `${ADAPTIVE_CAP_PREFIX}${userProfileId}:${dateKey}`;
  const current = await redis.get<string>(key);
  const next = (current ? Number.parseInt(String(current), 10) : 0) + 1;
  await redis.set(key, String(next), { ex: 172800 });
}

function cooldownElapsed(
  lastSentAt: string | null | undefined,
  cooldownHours: number | null | undefined,
  now: Date,
): boolean {
  if (!lastSentAt || !cooldownHours || cooldownHours <= 0) {
    return true;
  }
  const last = new Date(lastSentAt).getTime();
  if (Number.isNaN(last)) {
    return true;
  }
  return now.getTime() - last >= cooldownHours * 60 * 60 * 1000;
}

export async function runProactiveGuards(input: ProactiveGuardInput): Promise<ProactiveGuardResult> {
  if (!input.allowQuietHoursOverride && inQuietHours(input.now, input.timezone)) {
    return { ok: false, reason: "quiet_hours" };
  }

  if (!cooldownElapsed(input.lastSentAt, input.cooldownHours, input.now)) {
    return { ok: false, reason: "cooldown" };
  }

  if (input.capBucket === "adaptive") {
    const dateKey = getLocalTimeParts(input.now, input.timezone).dateKey;
    const cap = await checkAdaptiveCap(input.userProfileId, dateKey);
    if (!cap.allowed) {
      return { ok: false, reason: "adaptive_cap" };
    }
  }

  const claimed = await claimProactiveDelivery(input.dedupeKey, input.dedupeTtlSec);
  if (!claimed) {
    return { ok: false, reason: "dedupe" };
  }

  return { ok: true };
}

export { ADAPTIVE_CAP_PER_DAY };
