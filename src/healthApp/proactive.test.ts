import { describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {}, anthropic: {} }));

import { dueNudges } from "./proactive.js";
import { parsePrefs } from "./push.js";
import type { HealthSnapshot } from "./snapshot.js";

const prefs = parsePrefs({});
// Asia/Kolkata is UTC+5:30: 08:10 IST = 02:40Z.
const ist = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return new Date(Date.UTC(2026, 10, 2, h, m) - 330 * 60_000);
};

function snap(over: Partial<HealthSnapshot> = {}): HealthSnapshot {
  return {
    timezone: "Asia/Kolkata",
    today: {
      date: "2026-11-02",
      checks: [
        { id: "meals_logged", label: "Meals logged", met: false, progress: 0.33, detail: "1/3 meals" },
        { id: "protein", label: "Protein", met: false, progress: 0.4, detail: "60 / 150 g" },
        { id: "steps", label: "Steps", met: false, progress: 0.3, detail: "2,400 / 8,000" },
      ],
      onTrack: false,
      score: 34,
      calories: 600,
      proteinG: 60,
      steps: 2400,
      walkMinutes: null,
      isTrainingDay: true,
    },
    northStar: { onTrackDays: 3, windowDays: 7, goal: 5, days: [], mostMissed: null },
    targets: { calorieTarget: 2200, proteinTarget: 150, stepTarget: 8000, trainingDays: [1], minMealSessions: 3 },
    workouts: [],
    hevyConnected: true,
    gym: { time: "18:30", checkDelayMin: 180, checkAt: "21:30" },
    workoutChecks: [],
    recentSkips: [],
    goal: null,
    checkins: [],
    meals: [{ mealSessionId: "a", slot: "breakfast", text: "oats", calories: 600, proteinG: 60, loggedAt: "" }],
    ...over,
  } as HealthSnapshot;
}

describe("dueNudges", () => {
  it("sends the morning plan with the gym slot", () => {
    const n = dueNudges(snap(), ist("08:10"), prefs);
    expect(n.map((x) => x.kind)).toEqual(["morning_plan"]);
    expect(n[0]!.body).toBe("Training day: gym at 6:30 pm. 2,200 kcal · 150 g protein · 8,000 steps. Week so far: 3/7 on track.");
    expect(n[0]!.dedupeKey).toBe("morning_plan:2026-11-02");
  });

  it("reminds about a meal only when that slot is empty", () => {
    expect(dueNudges(snap(), ist("10:45"), prefs)).toEqual([]);
    expect(dueNudges(snap(), ist("14:40"), prefs).map((x) => x.dedupeKey)).toEqual(["meal_reminder:lunch:2026-11-02"]);
  });

  it("nudges step pace with the walk needed", () => {
    const n = dueNudges(snap(), ist("17:05"), prefs);
    expect(n[0]).toMatchObject({ kind: "step_pace", body: "2,400 of 8,000. A 55-minute walk closes it." });
  });

  it("skips the step nudge when the phone's steps haven't synced in 2 hours", () => {
    const today = snap().today;
    const phone = (syncedAt: string | null) => snap({ today: { ...today, stepsFromPhone: true, phoneSyncedAt: syncedAt } });
    expect(dueNudges(phone(ist("16:30").toISOString()), ist("17:05"), prefs).map((x) => x.kind)).toEqual(["step_pace"]);
    expect(dueNudges(phone(ist("14:30").toISOString()), ist("17:05"), prefs)).toEqual([]);
    expect(dueNudges(phone(null), ist("17:05"), prefs)).toEqual([]);
  });

  it("wraps up the evening with what's open", () => {
    const n = dueNudges(snap(), ist("21:35"), prefs);
    expect(n.map((x) => x.kind)).toEqual(["meal_reminder", "evening_wrap"]);
    expect(n[1]!.body).toContain("Protein (60 / 150 g)");
  });

  it("respects quiet hours, turned-off kinds and the 90-minute window", () => {
    expect(dueNudges(snap(), ist("21:35"), parsePrefs({ quietStart: "21:00", quietEnd: "07:00" }))).toEqual([]);
    expect(dueNudges(snap(), ist("08:10"), parsePrefs({ off: ["morning_plan"] }))).toEqual([]);
    expect(dueNudges(snap(), ist("09:40"), prefs)).toEqual([]);
  });

  it("asks for the weigh-in when it's due", () => {
    const s = snap({ goal: { checkinDue: true } as HealthSnapshot["goal"] });
    expect(dueNudges(s, ist("08:40"), prefs).map((x) => x.kind)).toEqual(["morning_plan", "weigh_in"]);
  });
});
