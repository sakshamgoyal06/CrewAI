import { describe, expect, it } from "vitest";

import type { Activity } from "./activities.js";
import { scoreDay } from "./northStar.js";
import {
  defaultLabel,
  dueRoutineEvents,
  followUpText,
  gymTimeOf,
  liftingGap,
  normalizeRoutine,
  onDate,
  reminderText,
  resolveActivityKey,
  routineDayStatus,
  routineLine,
  trainingDaysOf,
  type DayEvidence,
  type RoutineItem,
} from "./routine.js";

const TZ = "Asia/Kolkata";
const EVERY = [0, 1, 2, 3, 4, 5, 6];

function item(over: Partial<RoutineItem> & Pick<RoutineItem, "id" | "activityKey">): RoutineItem {
  return { label: over.activityKey, days: EVERY, startTime: "07:00", durationMin: 30, remindBeforeMin: 15, checkAfterMin: 90, position: 0, ...over };
}

function act(over: Partial<Activity> & Pick<Activity, "id" | "key">): Activity {
  return {
    localDate: "2026-11-03", startTime: null, durationMin: 30, label: over.key, intensity: "moderate", distanceM: null,
    kcal: 150, kcalSource: "estimate", source: "quick_add", duplicateOf: null, ...over,
  };
}

const ev = (over: Partial<DayEvidence> = {}): DayEvidence => ({ workouts: 0, activities: [], walkMinutes: null, checks: new Map(), ...over });

const walk = item({ id: "w", activityKey: "walking", label: "Morning walk" });
const gym = item({ id: "g", activityKey: "gym", label: "Evening gym", days: [1, 3, 5], startTime: "18:30", durationMin: 60, remindBeforeMin: 30, checkAfterMin: 180, position: 1 });
const swim = item({ id: "s", activityKey: "swimming", label: "Swim", days: [2], startTime: "06:30", durationMin: 45, position: 2 });

describe("routine input", () => {
  it("resolves gym words, catalog keys and free text", () => {
    expect(resolveActivityKey("gym")).toBe("gym");
    expect(resolveActivityKey("weight training")).toBe("gym");
    expect(resolveActivityKey("swimming")).toBe("swimming");
    expect(resolveActivityKey("played football")).toBe("football");
    expect(resolveActivityKey("walk")).toBe("walking");
  });

  it("fills labels, reminders and follow-up delays", () => {
    const [w, g, s] = normalizeRoutine([
      { activity: "walk", days: [3, 1, 1], startTime: "07:00", durationMin: 30 },
      { activity: "gym", days: [1, 3, 5], startTime: "18:30", durationMin: 60 },
      { activity: "swimming", days: [2], startTime: null, durationMin: 45, remindBeforeMin: 15 },
    ]);
    expect(w).toMatchObject({ activityKey: "walking", label: "Morning walk", days: [1, 3], remindBeforeMin: 15, checkAfterMin: 90 });
    expect(g).toMatchObject({ activityKey: "gym", label: "Evening gym", remindBeforeMin: 30, checkAfterMin: 180 });
    // No time: no reminder.
    expect(s).toMatchObject({ label: "Swim", remindBeforeMin: null, checkAfterMin: 105, position: 2 });
  });

  it("keeps a reminder turned off", () => {
    expect(normalizeRoutine([{ activity: "walking", days: [1], startTime: "07:00", durationMin: 20, remindBeforeMin: null }])[0]!.remindBeforeMin).toBeNull();
  });

  it("labels by time of day", () => {
    expect(defaultLabel("walking", "20:30")).toBe("Evening walk");
    expect(defaultLabel("football", "17:00")).toBe("Football");
    expect(defaultLabel("other", null, "pickup cricket")).toBe("Pickup cricket");
  });
});

describe("training days and the strength minimum", () => {
  it("counts everything but walks as training", () => {
    expect(trainingDaysOf([walk, gym, swim])).toEqual([1, 2, 3, 5]);
    expect(gymTimeOf([walk, gym, swim])).toBe("18:30");
  });

  it("flags fewer than 3 gym days", () => {
    expect(liftingGap([walk, gym, swim])).toEqual({ gymDays: 3, need: 3, short: false });
    expect(liftingGap([walk, { ...gym, days: [1] }, { ...swim, days: [2, 4] }])).toEqual({ gymDays: 1, need: 3, short: true });
    // Two training days in all: the minimum is capped at two.
    expect(liftingGap([{ ...gym, days: [1] }, swim])).toEqual({ gymDays: 1, need: 2, short: true });
    expect(liftingGap([walk])).toEqual({ gymDays: 0, need: 0, short: false });
  });
});

describe("routineDayStatus", () => {
  // 2026-11-03 is a Tuesday (2): walk + swim. 2026-11-02 is a Monday (1): walk + gym.
  it("ticks a planned activity off when it's logged for at least half the time", () => {
    const st = routineDayStatus([walk, gym, swim], 2, ev({ activities: [act({ id: "a1", key: "swimming", label: "Swimming", durationMin: 25 })] }));
    expect(st.map((s) => [s.itemId, s.state])).toEqual([["s", "done"], ["w", "pending"]]);
    expect(st[0]!.detail).toBe("Swimming · 25 min");
  });

  it("doesn't count a session that's too short or a duplicate", () => {
    const st = routineDayStatus([swim], 2, ev({ activities: [act({ id: "a1", key: "swimming", durationMin: 15 }), act({ id: "a2", key: "swimming", durationMin: 45, duplicateOf: "x" })] }));
    expect(st[0]!.state).toBe("pending");
  });

  it("uses the phone's walk minutes, once per walk", () => {
    const evening = item({ id: "w2", activityKey: "walking", label: "Evening walk", startTime: "20:30", durationMin: 30 });
    const one = routineDayStatus([walk, evening], 2, ev({ walkMinutes: 35 }));
    expect(one.map((s) => s.state)).toEqual(["done", "pending"]);
    const both = routineDayStatus([walk, evening], 2, ev({ walkMinutes: 60 }));
    expect(both.map((s) => s.state)).toEqual(["done", "done"]);
  });

  it("never uses one logged session for two items", () => {
    const evening = item({ id: "w2", activityKey: "walking", label: "Evening walk", startTime: "20:30" });
    const st = routineDayStatus([walk, evening], 2, ev({ activities: [act({ id: "a1", key: "walking" })] }));
    expect(st.map((s) => s.state)).toEqual(["done", "pending"]);
  });

  it("marks the gym done from Hevy, a sport that counted, or skipped from the check", () => {
    expect(routineDayStatus([walk, gym], 1, ev({ workouts: 1 }))[1]).toMatchObject({ state: "done", detail: "Logged in Hevy" });
    const football = act({ id: "f", key: "football", label: "Football", durationMin: 90, kcal: 700 });
    expect(routineDayStatus([gym], 1, ev({ sport: football, activities: [football] }))[0]).toMatchObject({ state: "done", detail: "Football counted" });
    expect(routineDayStatus([gym], 1, ev({ gymSkipped: { reason: "Busy" } }))[0]).toMatchObject({ state: "skipped", detail: "Skipped · Busy" });
    expect(routineDayStatus([gym], 1, ev())[0]).toMatchObject({ state: "pending", detail: "6:30 pm" });
  });

  it("a planned swim can't also stand in for the gym", () => {
    const both = [{ ...gym, days: [2] }, swim];
    const s = act({ id: "a1", key: "swimming", label: "Swimming", durationMin: 60, kcal: 600 });
    const st = routineDayStatus(both, 2, ev({ sport: s, activities: [s] }));
    expect(st.map((x) => [x.itemId, x.state])).toEqual([["s", "done"], ["g", "pending"]]);
  });

  it("follows the person's answer", () => {
    const checks = new Map([["w", { itemId: "w", localDate: "2026-11-03", label: "Morning walk", status: "skipped" as const, reason: "Rain", activityId: null }]]);
    expect(routineDayStatus([walk], 2, ev({ checks }))[0]).toMatchObject({ state: "skipped", detail: "Skipped · Rain" });
    // Logged after all: a walk logged in its window wins over an earlier skip.
    expect(routineDayStatus([walk], 2, ev({ checks, activities: [act({ id: "late", key: "walking", loggedAt: "2026-11-03T03:00:00Z" })], date: "2026-11-03", timezone: TZ }))[0]!.state).toBe("done");
    // The phone's walk minutes for the whole day can't say which walk it was, so they don't overrule the skip.
    expect(routineDayStatus([walk], 2, ev({ checks, walkMinutes: 30 }))[0]!.state).toBe("skipped");
  });
});

describe("Routine check in the north star", () => {
  const targets = { calorieTarget: null, proteinTarget: null, stepTarget: 1000, trainingDays: [1], minMealSessions: 0 };
  const day = { date: "2026-11-02", weekday: 1, mealSessions: 0, calories: 0, proteinG: 0, steps: 5000, workoutsLogged: 0 };

  it("replaces the workout check and needs every item", () => {
    const s = scoreDay({ ...day, routine: [{ label: "Morning walk", state: "done" }, { label: "Evening gym", state: "pending" }] }, targets);
    expect(s.checks.map((c) => c.id)).toEqual(["meals_logged", "steps", "routine"]);
    expect(s.checks[2]).toMatchObject({ met: false, progress: 0.5, detail: "Morning walk done · Evening gym not logged" });
    expect(s.onTrack).toBe(false);
    const all = scoreDay({ ...day, routine: [{ label: "Morning walk", state: "done" }, { label: "Evening gym", state: "done" }] }, targets);
    expect(all.onTrack).toBe(true);
  });

  it("keeps the old workout check without a routine", () => {
    expect(scoreDay(day, targets).checks.map((c) => c.id)).toContain("workout");
  });
});

describe("dueRoutineEvents", () => {
  // Tuesday 2026-11-03: walk 07:00 (15 min lead), swim 06:30 (15 min lead).
  const at = (iso: string) => dueRoutineEvents({ items: [walk, gym, swim], now: new Date(iso), timezone: TZ });

  it("reminds from the lead time until just after the start, on planned days only", () => {
    expect(at("2026-11-03T00:44:00Z").reminders).toEqual([]); // 06:14 IST
    expect(at("2026-11-03T01:00:00Z").reminders.map((r) => r.item.id)).toEqual(["s"]); // 06:30
    expect(at("2026-11-03T01:15:00Z").reminders.map((r) => r.item.id)).toEqual(["w"]); // 06:45: swim's window closed
    expect(at("2026-11-03T01:44:00Z").reminders.map((r) => r.item.id)).toEqual(["w"]); // 07:14
    expect(at("2026-11-03T01:46:00Z").reminders).toEqual([]); // 07:16
    // Gym isn't on Tuesdays.
    expect(at("2026-11-03T12:45:00Z").reminders).toEqual([]);
  });

  it("follows up non-gym items after check_after, never the gym", () => {
    const due = at("2026-11-03T03:00:00Z"); // 08:30 IST: walk (07:00 + 90) and swim (06:30 + 90) are due
    expect(due.followUps.map((f) => `${f.item.id}:${f.date}`)).toEqual(["w:2026-11-03", "s:2026-11-03"]);
    const mon = dueRoutineEvents({ items: [gym], now: new Date("2026-11-02T18:00:00Z"), timezone: TZ });
    expect(mon.followUps).toEqual([]);
  });

  it("follows up an untimed item in the evening, and yesterday's late items after midnight", () => {
    const untimed = item({ id: "u", activityKey: "yoga", startTime: null, remindBeforeMin: null });
    expect(dueRoutineEvents({ items: [untimed], now: new Date("2026-11-03T15:31:00Z"), timezone: TZ }).followUps.map((f) => f.date)).toEqual(["2026-11-03"]);
    const late = item({ id: "l", activityKey: "walking", startTime: "22:30", checkAfterMin: 90 });
    // 00:10 IST Wednesday: Tuesday's 22:30 walk is due.
    expect(dueRoutineEvents({ items: [late], now: new Date("2026-11-03T18:40:00Z"), timezone: TZ }).followUps.map((f) => f.date)).toEqual(["2026-11-03"]);
  });
});

describe("texts", () => {
  it("reads naturally", () => {
    const startsAt = new Date("2026-11-03T01:30:00Z");
    expect(reminderText(walk, new Date("2026-11-03T01:15:00Z"), startsAt).title).toBe("Morning walk in 15 min");
    expect(reminderText(walk, startsAt, startsAt).title).toBe("Morning walk now");
    expect(followUpText(walk, "2026-11-03", "2026-11-03")).toBe("No sign of your morning walk (7:00 am). Did you get it in?");
    expect(followUpText(walk, "2026-11-02", "2026-11-03")).toBe("No sign of your morning walk (yesterday 7:00 am). Did you get it in?");
    expect(routineLine([walk, gym])).toBe("Morning walk 7:00 am · Evening gym 6:30 pm");
  });
});

// 5 Nov: morning walk skipped ("Tired"), a 30 min walk logged from chat at 8:06 pm ticked it off,
// and "no gym till the 25th" left the gym "skipped" every day instead of swapped for a walk.
describe("time of day, skips and swaps", () => {
  const morning = item({ id: "m", activityKey: "walking", label: "Morning walk", startTime: "07:00", durationMin: 60 });
  const evening = act({ id: "a1", key: "walking", loggedAt: "2026-11-05T14:36:21Z" }); // 8:06 pm IST
  const skipped = new Map([["m", { itemId: "m", localDate: "2026-11-05", label: "Morning walk", status: "skipped" as const, reason: "Tired", activityId: null }]]);

  it("an evening walk never ticks off the morning walk", () => {
    const [st] = routineDayStatus([morning], 4, ev({ activities: [evening], checks: skipped, date: "2026-11-05", timezone: TZ }));
    expect(st).toMatchObject({ state: "skipped", detail: "Skipped · Tired" });
  });

  it("a morning walk still counts, and the phone's walk minutes don't overrule a skip", () => {
    const early = act({ id: "a2", key: "walking", loggedAt: "2026-11-05T02:30:00Z" }); // 8:00 am IST
    expect(routineDayStatus([morning], 4, ev({ activities: [early], date: "2026-11-05", timezone: TZ }))[0]!.state).toBe("done");
    expect(routineDayStatus([morning], 4, ev({ walkMinutes: 80, checks: skipped, date: "2026-11-05", timezone: TZ }))[0]!.state).toBe("skipped");
  });

  const gymSwapped = { ...gym, days: EVERY, swap: { activityKey: "walking", label: "Evening walk (for evening gym)", durationMin: 30, startTime: "18:30", from: "2026-11-05", until: "2026-11-25", reason: "No gym access" } };

  it("a swapped gym day is the walk, done by the evening walk", () => {
    const [st] = routineDayStatus([gymSwapped], 4, ev({ activities: [evening], date: "2026-11-05", timezone: TZ }));
    expect(st).toMatchObject({ label: "Evening walk (for evening gym)", gym: false, state: "done" });
  });

  it("the swap ends on its own after the last date", () => {
    expect(onDate(gymSwapped, "2026-11-25").activityKey).toBe("walking");
    expect(onDate(gymSwapped, "2026-11-26").activityKey).toBe("gym");
    expect(onDate(gymSwapped, "2026-11-04").activityKey).toBe("gym");
  });

  it("reminds and follows up the walk, not the gym, while it runs", () => {
    const at = new Date("2026-11-05T14:20:00Z"); // 7:50 pm IST, an hour+ after 6:30 pm + 30 min... follow-up window
    const { followUps } = dueRoutineEvents({ items: [{ ...gymSwapped, checkAfterMin: 60 }], now: at, timezone: TZ });
    expect(followUps.map((f) => f.item.label)).toEqual(["Evening walk (for evening gym)"]);
  });
});

describe("trainingDayOn", () => {
  const gym = { id: "g", activityKey: "gym", label: "Evening gym", days: [0, 1, 3, 4, 6], startTime: "18:30", durationMin: 60, remindBeforeMin: 15, checkAfterMin: 180, position: 0 } as never;
  const swapped = { ...(gym as object), swap: { activityKey: "walking", label: "Evening walk", durationMin: 30, startTime: null, from: "2026-11-05", until: "2026-11-25", reason: "no gym" } } as never;
  it("a swapped gym day is a rest day; the day after the swap ends is training again", async () => {
    const { trainingDayOn } = await import("./routine.js");
    expect(trainingDayOn("2026-11-09", [0, 1, 3, 4, 6], [gym])).toBe(true); // Monday
    expect(trainingDayOn("2026-11-09", [0, 1, 3, 4, 6], [swapped])).toBe(false);
    expect(trainingDayOn("2026-11-26", [0, 1, 3, 4, 6], [swapped])).toBe(true); // Thursday after
    expect(trainingDayOn("2026-11-10", [0, 1, 3, 4, 6], [gym])).toBe(false); // Tuesday
    expect(trainingDayOn("2026-11-09", [1], null)).toBe(true);
  });
});
