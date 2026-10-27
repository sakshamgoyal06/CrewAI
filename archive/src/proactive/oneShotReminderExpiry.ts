/**
 * One-shot custom reminders deliver only within a short late window after `at`.
 * Past that window they are marked missed — no stale backlog dumps.
 */

const MS_PER_HOUR = 60 * 60 * 1000;

/** Hours after scheduled `at` we still deliver; default 24. */
export function oneShotReminderMaxLateHours(): number {
  const raw = process.env.MAGNUS_ONE_SHOT_REMINDER_MAX_LATE_HOURS?.trim();
  if (raw === undefined || raw === "") {
    return 24;
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1 || n > 168) {
    return 24;
  }
  return n;
}

export function oneShotReminderMaxLateMs(): number {
  return oneShotReminderMaxLateHours() * MS_PER_HOUR;
}

export function isOneShotReminderDeliverable(at: Date, now: Date): boolean {
  const scheduledMs = at.getTime();
  const nowMs = now.getTime();
  if (Number.isNaN(scheduledMs) || scheduledMs > nowMs) {
    return false;
  }
  return nowMs - scheduledMs <= oneShotReminderMaxLateMs();
}

export function isOneShotReminderExpired(at: Date, now: Date): boolean {
  const scheduledMs = at.getTime();
  const nowMs = now.getTime();
  if (Number.isNaN(scheduledMs) || scheduledMs > nowMs) {
    return false;
  }
  return nowMs - scheduledMs > oneShotReminderMaxLateMs();
}
