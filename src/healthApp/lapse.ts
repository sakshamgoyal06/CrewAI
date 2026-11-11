/**
 * When someone stops logging (lapsed-logging design, 11 Nov 2026): one calm message on set days,
 * lighter the longer they're away, never the same words twice, and always a one-line way back.
 *
 * Days are "blank days": finished days in a row with nothing logged, ending yesterday
 * (loggingStatus.ts). The day after the first blank day the morning brief already says it, so
 * pushes start on day 2.
 *
 * - Day 2 and 3: what got in the way? (the coach routes the answer: travel, festival, unwell...)
 * - Day 5 and 7: a small restart (one line a day, or tap Ate this).
 * - Day 14: daily coaching ends; Magnus says it will check in every few days.
 * - After that (Saksham: more often than twice): every 3 days to day 30, weekly to day 60. Then stop.
 *
 * Pure: the proactive loop sends what this returns, deduped per day.
 */
import type { Notification } from "./push.js";
import type { HealthSnapshot } from "./snapshot.js";

/** Local time window the lapse message goes out in (after lunch: a natural moment to catch up). */
export const LAPSE_AT = "12:30";
/** After this many blank days nothing more is sent. */
export const LAPSE_LAST_DAY = 60;
/** From this many blank days the proactive loop's daily coaching stops (it only sends these). */
export const LAPSE_QUIET_FROM = 14;

/** Is a lapse message due after this many blank days? Pure. */
export function lapseDue(blankDays: number): boolean {
  if ([2, 3, 5, 7, LAPSE_QUIET_FROM].includes(blankDays)) return true;
  if (blankDays > LAPSE_QUIET_FROM && blankDays <= 30) return (blankDays - LAPSE_QUIET_FROM) % 3 === 0;
  if (blankDays > 30 && blankDays <= LAPSE_LAST_DAY) return (blankDays - 30) % 7 === 0;
  return false;
}

/** "5 kg from 113 kg", from the goal's first metric, when there's a reading. */
function goalGap(s: Pick<HealthSnapshot, "goal">): string | null {
  const m = s.goal?.metrics.find((x) => x.latest !== null);
  if (!m || m.latest === null) return null;
  const gap = Math.abs(m.target - m.latest);
  if (gap < 0.1) return null;
  const n = m.unit === "%" ? gap.toFixed(1) : gap >= 10 ? Math.round(gap).toString() : gap.toFixed(1).replace(/\.0$/, "");
  return `${n} ${m.unit} from ${m.target} ${m.unit}`;
}

/** The message for this many blank days, or null when none is due. Pure. */
export function lapseNudge(s: Pick<HealthSnapshot, "goal">, blankDays: number, date: string): Notification | null {
  if (!lapseDue(blankDays)) return null;
  const gap = goalGap(s);
  const dedupeKey = `logging_nudge:${blankDays}:${date}`;
  const url = "/app/#coach";
  let title: string;
  let body: string;
  if (blankDays === 2) {
    title = "Two days without a log";
    body = "No judgement, life happens. What got in the way? Tell me in a line and I'll adjust the plan to fit.";
  } else if (blankDays === 3) {
    title = "Still here when you're ready";
    body = "Busy, travelling or unwell? Tell me and I'll make the plan fit. Catching up is one line: roughly what you ate today.";
  } else if (blankDays === 5) {
    title = "Restart small";
    body = "Just log one thing today, even a rough line. Tap Ate this on any planned meal you had.";
  } else if (blankDays === 7) {
    title = "A week off logging";
    body = gap ? `You're ${gap}. Log today's meals in one line and we pick up from here.` : "Log today's meals in one line and we pick up from here.";
  } else if (blankDays === LAPSE_QUIET_FROM) {
    title = "I'll check in every few days";
    body = "I'm pausing the daily reminders. Log anything, any time, and I'll pick right up.";
  } else {
    // Win-back: a different line each time (days 17, 20 ... 30, then 37 ... 58).
    const variants: Array<[string, string]> = [
      ["Ready for a fresh start?", gap ? `You were ${gap}. Say "fresh start" and I'll set a plan from today.` : `Say "fresh start" and I'll set a plan from today.`],
      ["One line is enough", "Tell me roughly what you ate today and we're back on. No catching up on the past needed."],
      ["Your plan is waiting", gap ? `Still ${gap}. A short walk and one logged meal today is a real start.` : "A short walk and one logged meal today is a real start."],
      ["Still here for your goal", "Whenever you're ready, open the app and tell me how things are. I'll fit the plan around your week."],
    ];
    const step = blankDays <= 30 ? (blankDays - LAPSE_QUIET_FROM) / 3 : 6 + (blankDays - 30) / 7;
    [title, body] = variants[(Math.round(step) - 1) % variants.length]!;
  }
  return { kind: "logging_nudge", dedupeKey, title, body, url };
}
