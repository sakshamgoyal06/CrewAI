import { afterEach, describe, expect, it } from "vitest";

import {
  gymSessionLabelFromTitle,
  hevyWorkoutLocalDate,
  hevyWorkoutMatchesEvent,
  hevyWorkoutTimes,
  pickHevyWorkoutForGymEvent,
  readHevyReconcileMetadata,
} from "./gymHevyMatch.js";
import { buildMatchedMessage, buildMissedGymMessage, isGymEventDueForHevyReconcile } from "./gymHevyReconcile.js";
import type { HevyWorkout } from "../pillars/health/workouts/hevy/types.js";

describe("gymSessionLabelFromTitle", () => {
  it("extracts session after dash", () => {
    expect(gymSessionLabelFromTitle("Gym — Pull A")).toBe("Pull A");
    expect(gymSessionLabelFromTitle("Gym - Push B")).toBe("Push B");
  });
});

describe("hevyWorkoutMatchesEvent", () => {
  it("matches Pull A titles", () => {
    const w: HevyWorkout = { title: "Pull A", start_time: "2026-08-06T03:36:00.000Z" };
    expect(hevyWorkoutMatchesEvent(w, "Gym — Pull A")).toBe(true);
    expect(hevyWorkoutMatchesEvent(w, "Gym — Push A")).toBe(false);
  });
});

describe("pickHevyWorkoutForGymEvent", () => {
  const workouts: HevyWorkout[] = [
    { id: "a", title: "Push A", start_time: "2026-08-07T03:30:00.000Z", end_time: "2026-08-07T04:30:00.000Z" },
    { id: "b", title: "Pull A", start_time: "2026-08-06T03:36:00.000Z", end_time: "2026-08-06T04:31:00.000Z" },
  ];

  it("picks matching session on the planned day", () => {
    const planned = new Date("2026-08-06T03:30:00.000Z");
    const picked = pickHevyWorkoutForGymEvent(workouts, {
      eventTitle: "Gym — Pull A",
      plannedStartAt: planned,
      timeZone: "Asia/Kolkata",
    });
    expect(picked?.id).toBe("b");
  });
});

describe("hevyWorkoutLocalDate", () => {
  it("uses user timezone for calendar day", () => {
    const w: HevyWorkout = { start_time: "2026-08-06T03:36:00.000Z" };
    expect(hevyWorkoutLocalDate(w, "Asia/Kolkata")).toBe("2026-08-06");
  });
});

describe("hevyWorkoutTimes", () => {
  it("returns valid start/end", () => {
    const t = hevyWorkoutTimes({
      start_time: "2026-08-06T03:36:00.000Z",
      end_time: "2026-08-06T04:31:00.000Z",
    });
    expect(t?.startedAt.toISOString()).toBe("2026-08-06T03:36:00.000Z");
    expect(t?.endedAt.toISOString()).toBe("2026-08-06T04:31:00.000Z");
  });
});

describe("readHevyReconcileMetadata", () => {
  it("reads reconcile block", () => {
    expect(
      readHevyReconcileMetadata({
        hevy_reconcile: { at: "2026-08-07T01:00:00Z", result: "matched", hevy_workout_id: "w1" },
      }),
    ).toEqual({ at: "2026-08-07T01:00:00Z", result: "matched", hevy_workout_id: "w1" });
  });
});

describe("isGymEventDueForHevyReconcile", () => {
  const base = {
    id: "e1",
    user_profile_id: "u1",
    title: "Gym — Pull A",
    time_zone: "Asia/Kolkata",
    planned_start_at: "2026-08-06T03:30:00.000Z",
    status: "planned",
    metadata: {},
    external_refs: {},
  };

  it("is due after 3h grace", () => {
    const now = new Date("2026-08-06T07:00:00.000Z");
    expect(isGymEventDueForHevyReconcile(base, now)).toBe(true);
  });

  it("is not due before grace", () => {
    const now = new Date("2026-08-06T05:00:00.000Z");
    expect(isGymEventDueForHevyReconcile(base, now)).toBe(false);
  });
});

describe("buildMatchedMessage", () => {
  it("includes workout title and duration", () => {
    const msg = buildMatchedMessage({
      eventTitle: "Gym — Pull A",
      workout: {
        title: "Pull A",
        start_time: "2026-08-06T03:36:00.000Z",
        end_time: "2026-08-06T04:31:00.000Z",
      },
      timeZone: "Asia/Kolkata",
    });
    expect(msg).toContain("Pull A");
    expect(msg).toContain("Hevy");
  });
});

describe("buildMissedGymMessage", () => {
  it("asks about miss or postpone", () => {
    expect(buildMissedGymMessage("Gym — Push A")).toContain("postpone");
  });
});
