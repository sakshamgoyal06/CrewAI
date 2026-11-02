import { describe, expect, it } from "vitest";

import {
  burnForDay,
  estimateActivityKcal,
  findHealthConnectMatch,
  healthConnectActivityKey,
  liftingNote,
  matchActivity,
  metFor,
  mondayOf,
  stepsDuring,
  trainingActivity,
  typicalTrainingBurn,
  workoutBurn,
  type Activity,
} from "./activities.js";

const act = (over: Partial<Activity> = {}): Activity => ({
  id: "a1",
  localDate: "2026-11-02",
  startTime: null,
  durationMin: 45,
  key: "swimming",
  label: "Swimming",
  intensity: "moderate",
  distanceM: null,
  kcal: 270,
  kcalSource: "estimate",
  source: "chat",
  duplicateOf: null,
  ...over,
});

describe("catalog matching", () => {
  it("finds the activity in free text", () => {
    expect(matchActivity("swam 45 min").key).toBe("swimming");
    expect(matchActivity("played football with friends").key).toBe("football");
    expect(matchActivity("table tennis").key).toBe("table_tennis");
    expect(matchActivity("tennis singles").key).toBe("tennis");
    expect(matchActivity("spin class").key).toBe("indoor_cycling");
    expect(matchActivity("5k run").key).toBe("running");
    expect(matchActivity("surya namaskar").key).toBe("yoga");
    expect(matchActivity("gardening").key).toBe("other");
  });

  it("maps Health Connect exercise types and skips walks", () => {
    expect(healthConnectActivityKey("SWIMMING_POOL")).toBe("swimming");
    expect(healthConnectActivityKey("EXERCISE_TYPE_RUNNING")).toBe("running");
    expect(healthConnectActivityKey("BIKING_STATIONARY")).toBe("indoor_cycling");
    expect(healthConnectActivityKey("WEIGHTLIFTING")).toBe("strength");
    expect(healthConnectActivityKey("HIGH_INTENSITY_INTERVAL_TRAINING")).toBe("hiit");
    expect(healthConnectActivityKey("WALKING")).toBeNull();
    expect(healthConnectActivityKey("BADMINTON")).toBe("badminton");
  });
});

describe("burn estimate", () => {
  it("counts only the burn above resting", () => {
    // (5.8 − 1) × 75 kg × 0.75 h = 270
    expect(estimateActivityKcal({ key: "swimming", intensity: "moderate", minutes: 45, weightKg: 75 })).toEqual({ kcal: 270, met: 5.8 });
    expect(estimateActivityKcal({ key: "swimming", intensity: "hard", minutes: 45, weightKg: 75 }).kcal).toBe(495);
  });

  it("uses speed for runs and rides when distance is known", () => {
    // 5 km in 30 min = 10 km/h, between 9.7 (9.8) and 10.8 (10.5)
    expect(metFor("running", "easy", 30, 5000)).toBeCloseTo(10.0, 1);
    expect(metFor("running", "moderate", 30)).toBe(9.0);
  });
});

describe("steps during an activity", () => {
  const buckets = [
    { startTime: "2026-11-02T01:00:00Z", endTime: "2026-11-02T02:00:00Z", count: 6000 },
    { startTime: "2026-11-02T02:00:00Z", endTime: "2026-11-02T03:00:00Z", count: 600 },
  ];

  it("takes the step buckets inside the window, pro rata at the edges", () => {
    const run = act({ key: "running", startTime: "2026-11-02T01:30:00Z", durationMin: 60 });
    expect(stepsDuring(run, buckets, 6600)).toBe(3300);
  });

  it("without a time, uses the step rate only for step-based activities", () => {
    expect(stepsDuring(act({ key: "running", durationMin: 30 }), [], 10_000)).toBe(4800);
    expect(stepsDuring(act({ key: "running", durationMin: 30 }), [], 2000)).toBe(2000);
    expect(stepsDuring(act({ key: "swimming" }), [], 10_000)).toBe(0);
  });
});

describe("burnForDay", () => {
  const kg = 80;

  it("adds activities to the steps and Hevy estimate", () => {
    const b = burnForDay({ activeKcal: null, steps: 8000, workouts: [], activities: [act()], weightKg: kg })!;
    expect(b).toMatchObject({ source: "estimate", stepsKcal: 320, workoutKcal: 0, activityKcal: 270, kcal: 590 });
  });

  it("takes a run's steps off the steps estimate so they aren't counted twice", () => {
    const run = act({ key: "running", label: "Running", durationMin: 30, kcal: 380 });
    const b = burnForDay({ activeKcal: null, steps: 10_000, workouts: [], activities: [run], weightKg: kg })!;
    // 4,800 steps belong to the run; 5,200 left → 208 kcal
    expect(b.stepsKcal).toBe(208);
    expect(b.kcal).toBe(208 + 380);
  });

  it("leaves out a manual entry that a Health Connect session covers", () => {
    const hc = act({ id: "hc", source: "health_connect", kcal: 300 });
    const manual = act({ id: "m", duplicateOf: "hc" });
    const b = burnForDay({ activeKcal: null, steps: 0, workouts: [], activities: [hc, manual], weightKg: kg })!;
    expect(b.activityKcal).toBe(300);
    expect(b.activities.find((l) => l.id === "m")).toMatchObject({ counted: false, why: "duplicate_health_connect" });
  });

  it("treats a Health Connect strength session at the time of a Hevy workout as the same workout", () => {
    const watch = act({ id: "w", key: "strength", label: "Strength training", source: "health_connect", startTime: "2026-11-02T12:10:00Z", durationMin: 50, kcal: 250 });
    const b = burnForDay({ activeKcal: null, steps: 0, workouts: [{ startTime: "2026-11-02T12:00:00Z", durationMin: 60 }], activities: [watch], weightKg: kg })!;
    expect(b.workoutKcal).toBe(workoutBurn(60, kg));
    expect(b.activityKcal).toBe(0);
    expect(b.activities[0]).toMatchObject({ counted: false, why: "duplicate_hevy" });
  });

  it("with the phone's active calories, adds only what the phone didn't see", () => {
    const hc = act({ id: "hc", source: "health_connect", kcal: 300 });
    const manual = act({ id: "m", key: "football", label: "Football", kcal: 500 });
    const b = burnForDay({ activeKcal: 600, steps: 7000, workouts: [], activities: [hc, manual], weightKg: kg })!;
    expect(b.source).toBe("health_connect");
    expect(b.kcal).toBe(1100);
    expect(b.activityKcal).toBe(500);
  });

  it("with the phone's active calories, a manual run gives back the steps the phone already counted", () => {
    const run = act({ key: "running", label: "Running", durationMin: 30, kcal: 380 });
    const b = burnForDay({ activeKcal: 500, steps: 10_000, workouts: [], activities: [run], weightKg: kg })!;
    // 4,800 steps ≈ 192 kcal already in the phone's number
    expect(b.kcal).toBe(500 + 380 - 192);
  });
});

describe("Health Connect duplicates on entry", () => {
  const hc = act({ id: "hc", source: "health_connect", startTime: "2026-11-02T01:00:00Z", durationMin: 40 });

  it("matches the same activity on the same day when either side has no time", () => {
    expect(findHealthConnectMatch({ localDate: "2026-11-02", key: "swimming", startTime: null, durationMin: 45 }, [hc])?.id).toBe("hc");
  });

  it("needs overlapping times when both have them", () => {
    expect(findHealthConnectMatch({ localDate: "2026-11-02", key: "swimming", startTime: "2026-11-02T01:20:00Z", durationMin: 30 }, [hc])?.id).toBe("hc");
    expect(findHealthConnectMatch({ localDate: "2026-11-02", key: "swimming", startTime: "2026-11-02T12:00:00Z", durationMin: 30 }, [hc])).toBeNull();
  });

  it("ignores other activities and manual entries", () => {
    expect(findHealthConnectMatch({ localDate: "2026-11-02", key: "running", startTime: null, durationMin: 30 }, [hc])).toBeNull();
    expect(findHealthConnectMatch({ localDate: "2026-11-02", key: "swimming", startTime: null, durationMin: 30 }, [act()])).toBeNull();
  });
});

describe("training-day rules", () => {
  it("a usual gym session is the median Hevy session, or an hour without history", () => {
    expect(typicalTrainingBurn([50, 70, 60], 80)).toBe(workoutBurn(60, 80));
    expect(typicalTrainingBurn([], 80)).toBe(workoutBurn(60, 80));
  });

  it("a sport stands in only when it burns at least 80% of a usual session", () => {
    const typical = workoutBurn(60, 80); // 420 → needs 336
    expect(trainingActivity([act({ key: "football", label: "Football", kcal: 400 })], [], typical)?.label).toBe("Football");
    expect(trainingActivity([act({ key: "yoga", label: "Yoga", kcal: 120 })], [], typical)).toBeNull();
    expect(trainingActivity([act({ key: "walking", label: "Walking", kcal: 500 })], [], typical)).toBeNull();
    expect(trainingActivity([act({ key: "football", kcal: 400, duplicateOf: "x" })], [], typical)).toBeNull();
  });

  it("a strength session from the watch counts whatever it burned", () => {
    expect(trainingActivity([act({ key: "strength", label: "Strength training", source: "health_connect", kcal: 150 })], [], 420)?.key).toBe("strength");
  });

  it("weeks start on Monday", () => {
    expect(mondayOf("2026-11-02")).toBe("2026-11-02");
    expect(mondayOf("2026-11-08")).toBe("2026-11-02");
  });

  // Week of Mon 2 Nov 2026. Training days Mon–Fri (1..5).
  const five = [1, 2, 3, 4, 5];

  it("reminds them to keep enough training days for lifting when the week can still make it", () => {
    const n = liftingNote({ date: "2026-11-03", trainingDays: five, liftingDates: ["2026-11-02"], activityLabel: "Football" })!;
    expect(n.short).toBe(false);
    expect(n.text).toContain("keep 2 of your 3 remaining training days for lifting");
  });

  it("warns when sport means the week can't reach 3 strength sessions", () => {
    const n = liftingNote({ date: "2026-11-05", trainingDays: five, liftingDates: [], activityLabel: "Football" })!;
    expect(n.short).toBe(true);
    expect(n.text).toContain("can now reach at most 1");
  });

  it("caps the minimum at their training days", () => {
    const n = liftingNote({ date: "2026-11-04", trainingDays: [1, 3], liftingDates: ["2026-11-02"], activityLabel: "Swimming" })!;
    expect(n.short).toBe(true);
    expect(n.text).toContain("needs 2 strength sessions");
  });
});

describe("coach line under an activity card", async () => {
  const { activityDraftReply } = await import("./chat.js");
  const base = {
    draftId: "d1", date: "2026-11-02", startTime: null, durationMin: 45, key: "swimming", label: "Swimming",
    intensity: "moderate" as const, distanceM: null, kcal: 270, kcalSource: "estimate" as const, met: 5.8, weightKg: 75,
    duplicateOf: null, training: { countsAsTraining: false, neededKcal: null, note: null, short: false }, source: "chat" as const,
  };

  it("gives the estimate and asks them to save", () => {
    expect(activityDraftReply(base)).toBe("That's about 270 kcal for 45 min of swimming. Check the card and tap Save.");
  });

  it("adds the training note when there is one", () => {
    const note = "Swimming counts as today's training.";
    expect(activityDraftReply({ ...base, training: { countsAsTraining: true, neededKcal: 336, note, short: false } })).toContain(note);
  });

  it("says when Health Connect already has it", () => {
    expect(activityDraftReply({ ...base, duplicateOf: { id: "x", label: "Swimming", durationMin: 40, kcal: 300 } })).toContain("won't count it twice");
  });
});
