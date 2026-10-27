import { listEvents } from "../../events/eventStore.js";
import type { EventStatus } from "../../events/eventTypes.js";
import type { ProactiveSignalSnapshot } from "../signals.js";
import { localDayRange } from "./dateKeyRange.js";

export type DayRhythmSummary = {
  dateKey: string;
  done: number;
  missed: number;
  open: number;
  moved: number;
  text: string;
};

const DONE: EventStatus[] = ["done", "partial"];
const MISSED: EventStatus[] = ["missed", "skipped"];
const OPEN: EventStatus[] = ["planned", "in_progress"];
const MOVED: EventStatus[] = ["postponed", "preponed"];

export async function buildDayRhythmSummary(input: {
  userProfileId: string;
  timezone: string;
  dateKey: string;
  signals: ProactiveSignalSnapshot;
}): Promise<DayRhythmSummary> {
  const { from, to } = localDayRange(
    input.dateKey,
    input.timezone,
    input.signals.now,
    input.signals.local.dateKey,
  );

  const eventsResult = await listEvents({
    userProfileId: input.userProfileId,
    from,
    to,
    limit: 50,
  });

  const rows = eventsResult.ok ? eventsResult.data : [];
  let done = 0;
  let missed = 0;
  let open = 0;
  let moved = 0;
  const titlesDone: string[] = [];
  const titlesMissed: string[] = [];

  for (const row of rows) {
    const status = row.status as EventStatus;
    const title = row.title?.trim() || "Commitment";
    if (DONE.includes(status)) {
      done += 1;
      titlesDone.push(title);
    } else if (MISSED.includes(status)) {
      missed += 1;
      titlesMissed.push(title);
    } else if (OPEN.includes(status)) {
      open += 1;
    } else if (MOVED.includes(status)) {
      moved += 1;
    }
  }

  const lines: string[] = [`Day summary (${input.dateKey}):`];

  if (rows.length === 0) {
    lines.push("Commitments: none logged for this day.");
  } else {
    lines.push(
      `Commitments: ${done} done, ${missed} missed/skipped, ${open} still open, ${moved} moved.`,
    );
    if (titlesDone.length) {
      lines.push(`Done: ${titlesDone.slice(0, 5).join("; ")}`);
    }
    if (titlesMissed.length) {
      lines.push(`Missed/skipped: ${titlesMissed.slice(0, 3).join("; ")}`);
    }
  }

  if (input.signals.workoutLoggedToday) {
    lines.push("Workout: logged today.");
  } else if (input.signals.gymPlannedToday) {
    lines.push("Workout: gym on schedule today — not logged yet.");
  }

  const meals = input.signals.meals;
  const loggedSlots = meals.mealsLoggedTodaySlots;
  const plannedSlots = meals.plannedSlotsToday;
  if (loggedSlots.length > 0) {
    lines.push(
      `Meals logged: ${loggedSlots.join(", ")} (${meals.caloriesSoFarToday} kcal so far).`,
    );
  } else if (plannedSlots.length > 0) {
    lines.push(`Meals: planned (${plannedSlots.join(", ")}) but nothing logged yet.`);
  } else if (meals.caloriesSoFarToday > 0) {
    lines.push(`Meals: ${meals.caloriesSoFarToday} kcal logged today.`);
  }

  if (meals.plannedSlotsMissedToday.length > 0) {
    lines.push(`Meal slots missed today: ${meals.plannedSlotsMissedToday.join(", ")}.`);
  }

  return {
    dateKey: input.dateKey,
    done,
    missed,
    open,
    moved,
    text: lines.join("\n"),
  };
}
