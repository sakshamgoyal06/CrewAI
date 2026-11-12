// The Today "On track" fold's colour: how the day is going, in one glance.
//
//   gray   nothing to judge yet: no meal logged and no routine item done (steps alone don't count,
//          the phone syncs them on its own), or the day has no checks.
//   green  every check met, the day kept (its core checks met, northStar.ts), or the score is 80% or more with nothing gone wrong so far.
//   red    only from 2 pm (or on a past day), and only when calories AND the routine are both off.
//   yellow everything else: partly there.
//
// "Off so far" is judged by the clock on today, not against the whole day's target:
//   calories  over the top of the band (105% of target), or under 40% of target from 2 pm
//             (breakfast and lunch are about 60% of the day, so 40% is clearly behind);
//             on a past day, the calorie check not met.
//   routine   an item skipped, or a timed item still not done an hour after it should have ended;
//             an untimed item only counts once the day is over. On a past day, the routine (or
//             workout) check not met.
// Routine items arrive already resolved for the date by the server, so a running swap (e.g. gym
// swapped for a walk until the 25th) is what gets judged here, not the original item.

export const RED_FROM_MIN = 14 * 60;
const GREEN_SCORE = 80;
const KCAL_HIGH = 1.05;
const KCAL_BEHIND = 0.4;
const ITEM_GRACE_MIN = 60;

const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Whether calories have gone wrong by `nowMin` (null = the day is over). */
function caloriesOff(day, target, nowMin) {
  const check = day.checks.find((c) => c.id === "calories");
  if (!check) return false;
  if (nowMin === null) return !check.met;
  if (!target) return false;
  return day.calories > target * KCAL_HIGH || (nowMin >= RED_FROM_MIN && day.calories < target * KCAL_BEHIND);
}

/** Whether the routine has gone wrong by `nowMin` (null = the day is over). */
function routineOff(day, nowMin) {
  const items = day.routine || [];
  if (nowMin === null) {
    const check = day.checks.find((c) => c.id === "routine" || c.id === "workout");
    return !!check && !check.met;
  }
  return items.some((r) =>
    r.state === "skipped" ||
    (r.state === "pending" && r.startTime && nowMin > minutesOf(r.startTime) + (r.durationMin || 0) + ITEM_GRACE_MIN));
}

/**
 * The tone and a few words for it. `nowMin` is minutes after local midnight on today, or null
 * for a day that is over.
 * @returns {{ tone: "gray" | "green" | "yellow" | "red", label: string }}
 */
export function dayTone(day, target, nowMin) {
  const logged = (day.meals?.length || day.mealList?.done || 0) > 0 || (day.routine || []).some((r) => r.state === "done");
  if (!day.checks?.length || !logged) return { tone: "gray", label: nowMin === null ? "Nothing logged" : "Nothing logged yet" };
  const kcal = caloriesOff(day, target, nowMin);
  const routine = routineOff(day, nowMin);
  if (day.onTrack || (day.score >= GREEN_SCORE && !kcal && !routine)) {
    const all = day.checks.every((c) => c.met);
    return { tone: "green", label: all ? "All checks met" : day.onTrack ? "Day kept" : "Going well" };
  }
  const late = nowMin === null || nowMin >= RED_FROM_MIN;
  if (late && kcal && routine) return { tone: "red", label: "Calories and routine off" };
  return { tone: "yellow", label: kcal ? "Calories off so far" : routine ? "Routine behind" : "Partly there" };
}
