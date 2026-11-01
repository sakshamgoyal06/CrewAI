/**
 * Environment for Morning Brief (cron, default local hour, feature flags).
 * Documented in `magnus.md`.
 */
export function morningBriefFeatureEnabled(): boolean {
  const raw = process.env.MAGNUS_MORNING_BRIEF_ENABLED?.trim().toLowerCase();
  if (raw === undefined || raw === "") {
    return true;
  }
  return raw === "true" || raw === "1" || raw === "yes";
}

/** When false, the in-process cron does not start (Telegram `/morningbrief` and `POST /internal/jobs/morning-brief` still work if the feature flag is on). */
export function morningBriefCronEnabled(): boolean {
  const raw = process.env.MAGNUS_MORNING_BRIEF_CRON_ENABLED?.trim().toLowerCase();
  if (raw === undefined || raw === "") {
    return false;
  }
  return raw === "true" || raw === "1" || raw === "yes";
}

/** Local hour (0–23) in the user's timezone when the scheduled brief should fire. */
export function morningBriefLocalHour(): number {
  const raw = process.env.MAGNUS_MORNING_BRIEF_LOCAL_HOUR?.trim();
  if (raw === undefined || raw === "") {
    return 7;
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0 || n > 23) {
    return 7;
  }
  return n;
}

/** First N minutes of that hour count as the send window (dedupe via Redis). */
export function morningBriefWindowMinutes(): number {
  const raw = process.env.MAGNUS_MORNING_BRIEF_WINDOW_MINUTES?.trim();
  if (raw === undefined || raw === "") {
    return 14;
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1 || n > 59) {
    return 14;
  }
  return n;
}

export function morningBriefInternalSecret(): string | undefined {
  return process.env.MAGNUS_INTERNAL_JOB_SECRET?.trim() || undefined;
}
