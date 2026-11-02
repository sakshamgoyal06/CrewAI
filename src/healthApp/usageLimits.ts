/**
 * Daily caps on the AI-backed routes, per person, so one account can't run up the model bill.
 * Counted in memory per local day (a redeploy resets them, which only ever errs generous).
 * Set the env vars to 0 to turn a cap off.
 */
export type LimitedAction = "chat" | "photo";

const DEFAULTS: Record<LimitedAction, number> = { chat: 150, photo: 30 };
const ENV: Record<LimitedAction, string> = { chat: "MAGNUS_DAILY_CHAT_LIMIT", photo: "MAGNUS_DAILY_PHOTO_LIMIT" };

const counts = new Map<string, number>();
let countsDay = "";

export function dailyLimit(action: LimitedAction, env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[ENV[action]]?.trim();
  const n = raw ? Number.parseInt(raw, 10) : DEFAULTS[action];
  return Number.isFinite(n) && n >= 0 ? n : DEFAULTS[action];
}

/**
 * Counts one use; false when today's cap is already reached. `day` is the person's local date.
 * `limit` overrides the env cap (the free plan's smaller allowance).
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
  // Keep only the newest day's counters; older ones can't matter any more.
  if (day > countsDay) {
    for (const k of counts.keys()) if (!k.endsWith(`|${day}`)) counts.delete(k);
    countsDay = day;
  }
  const key = `${userProfileId}|${action}|${day}`;
  const used = counts.get(key) ?? 0;
  if (used >= limit) return false;
  counts.set(key, used + 1);
  return true;
}

export function _resetUsage(): void {
  counts.clear();
  countsDay = "";
}
