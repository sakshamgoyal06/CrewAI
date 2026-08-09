/**
 * Environment for Magnus-initiated Telegram delivery (scheduled cron and future triggers).
 */

function envTruthy(raw: string | undefined): boolean {
  if (raw === undefined || raw === "") {
    return false;
  }
  const v = raw.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function envFalsy(raw: string | undefined): boolean {
  if (raw === undefined || raw === "") {
    return false;
  }
  const v = raw.trim().toLowerCase();
  return v === "false" || v === "0";
}

/** Master switch for the in-process proactive cron (morning brief, event reminders, …). */
export function proactiveCronEnabled(): boolean {
  const raw = process.env.MAGNUS_PROACTIVE_CRON_ENABLED?.trim().toLowerCase();
  if (envTruthy(raw)) {
    return true;
  }
  if (envFalsy(raw)) {
    return false;
  }
  // Legacy: morning-brief-only flag still enables the shared cron.
  const legacy = process.env.MAGNUS_MORNING_BRIEF_CRON_ENABLED?.trim().toLowerCase();
  if (envTruthy(legacy)) {
    return true;
  }
  if (envFalsy(legacy)) {
    return false;
  }
  // Default on — proactive rituals are part of Magnus's role when the process is always-on.
  return true;
}

/** Cron tick interval in minutes (1–30). */
export function proactiveCronIntervalMinutes(): number {
  const raw = process.env.MAGNUS_PROACTIVE_CRON_INTERVAL_MINUTES?.trim();
  if (raw === undefined || raw === "") {
    return 5;
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1 || n > 30) {
    return 5;
  }
  return n;
}

/** Event reminders: look back N minutes so a missed tick still delivers. */
export function eventReminderLookbackMinutes(): number {
  const raw = process.env.MAGNUS_EVENT_REMINDER_LOOKBACK_MINUTES?.trim();
  if (raw === undefined || raw === "") {
    return 10;
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1 || n > 120) {
    return 10;
  }
  return n;
}

export function eventReminderJobEnabled(): boolean {
  const raw = process.env.MAGNUS_EVENT_REMINDER_ENABLED?.trim().toLowerCase();
  if (envTruthy(raw)) {
    return true;
  }
  if (envFalsy(raw)) {
    return false;
  }
  return proactiveCronEnabled();
}

/** Gym ↔ Hevy reconciliation: check Hevy after planned time + grace. */
export function gymHevyReconcileJobEnabled(): boolean {
  const raw = process.env.MAGNUS_GYM_HEVY_RECONCILE_ENABLED?.trim().toLowerCase();
  if (envTruthy(raw)) {
    return true;
  }
  if (envFalsy(raw)) {
    return false;
  }
  return proactiveCronEnabled();
}

/** How far back to scan for unreconciled gym events (days). */
export function gymHevyReconcileLookbackDays(): number {
  const raw = process.env.MAGNUS_GYM_HEVY_RECONCILE_LOOKBACK_DAYS?.trim();
  if (raw === undefined || raw === "") {
    return 7;
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1 || n > 30) {
    return 7;
  }
  return n;
}

/** Nightly nutrition rollup + anomaly flags + program memory sync. */
export function nutritionNightlyJobEnabled(): boolean {
  const raw = process.env.MAGNUS_NUTRITION_NIGHTLY_ENABLED?.trim().toLowerCase();
  if (envTruthy(raw)) {
    return true;
  }
  if (envFalsy(raw)) {
    return false;
  }
  return proactiveCronEnabled();
}

/** Subscription-based proactive messages (evening journal, drift guard, custom reminders). */
export function proactiveSubscriptionsJobEnabled(): boolean {
  const raw = process.env.MAGNUS_PROACTIVE_SUBSCRIPTIONS_ENABLED?.trim().toLowerCase();
  if (envTruthy(raw)) {
    return true;
  }
  if (envFalsy(raw)) {
    return false;
  }
  return proactiveCronEnabled();
}
