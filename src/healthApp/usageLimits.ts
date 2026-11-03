/**
 * Daily caps on the routes that spend model money, per person and local day, so one account
 * can't run up the bill. Counted in memory, but the first use of a day starts from what the
 * database already shows for that day (chat turns, served routes), so a redeploy no longer
 * hands everyone a fresh allowance. Set an env var to 0 to turn that cap off.
 */
export type LimitedAction = "chat" | "photo" | "rca" | "draft";

const DEFAULTS: Record<LimitedAction, number> = { chat: 150, photo: 30, rca: 3, draft: 80 };
const ENV: Record<LimitedAction, string> = {
  chat: "MAGNUS_DAILY_CHAT_LIMIT",
  photo: "MAGNUS_DAILY_PHOTO_LIMIT",
  rca: "MAGNUS_DAILY_RCA_LIMIT",
  draft: "MAGNUS_DAILY_DRAFT_LIMIT",
};

const counts = new Map<string, { day: string; used: number }>();

export function dailyLimit(action: LimitedAction, env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[ENV[action]]?.trim();
  const n = raw ? Number.parseInt(raw, 10) : DEFAULTS[action];
  return Number.isFinite(n) && n >= 0 ? n : DEFAULTS[action];
}

const keyOf = (userProfileId: string, action: LimitedAction, day: string) => `${userProfileId}|${action}|${day}`;

/** Days apart of two YYYY-MM-DD keys. */
const dayGap = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

/** Drops counters more than a day from `day`; people in other timezones may still be on yesterday. */
function prune(day: string): void {
  for (const [k, v] of counts) if (dayGap(v.day, day) > 1) counts.delete(k);
}

/** True when this person's counter for the day has not been loaded yet. */
export function needsSeed(userProfileId: string, action: LimitedAction, day: string): boolean {
  return !counts.has(keyOf(userProfileId, action, day));
}

/** Starts the day's counter from what already happened (never lowers a live count). */
export function seedUse(userProfileId: string, action: LimitedAction, day: string, used: number): void {
  const k = keyOf(userProfileId, action, day);
  const cur = counts.get(k);
  counts.set(k, { day, used: Math.max(cur?.used ?? 0, Math.max(0, Math.floor(used))) });
}

/**
 * Counts one use; false when today's cap is already reached. `day` is the person's local date.
 * `limitOverride` replaces the env cap (the free plan's smaller allowance).
 */
export function takeUse(
  userProfileId: string,
  action: LimitedAction,
  day: string,
  env: NodeJS.ProcessEnv = process.env,
  limitOverride?: number,
): boolean {
  const limit = limitOverride ?? dailyLimit(action, env);
  if (limit === 0) return true;
  if (counts.size > 20_000) prune(day);
  const k = keyOf(userProfileId, action, day);
  const cur = counts.get(k) ?? { day, used: 0 };
  if (cur.used >= limit) {
    counts.set(k, cur);
    return false;
  }
  counts.set(k, { day, used: cur.used + 1 });
  return true;
}

export function _resetUsage(): void {
  counts.clear();
}
