import { describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {}, anthropic: {} }));

import { dueNudges, pauseWeighInAllowed } from "./proactive.js";
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

  it("with a meal plan: reminds 2 h after the plan's own meal time, only for meals they plan", () => {
    const plan = { meals: [{ slot: "breakfast", time: "08:00" }, { slot: "dinner", time: "20:00" }], planPushOn: false };
    expect(dueNudges(snap(), ist("10:05"), prefs, plan).map((x) => x.dedupeKey)).toEqual([]);
    expect(dueNudges(snap(), ist("14:40"), prefs, plan)).toEqual([]);
    expect(dueNudges(snap({ meals: [] }), ist("10:05"), prefs, plan).map((x) => x.dedupeKey)).toEqual(["meal_reminder:breakfast:2026-11-02"]);
    expect(dueNudges(snap(), ist("22:05"), prefs, plan).map((x) => x.kind)).toContain("meal_reminder");
  });

  it("with the plan's meal-time push on, sends no second reminder", () => {
    const plan = { meals: [{ slot: "lunch", time: "13:00" }], planPushOn: true };
    expect(dueNudges(snap(), ist("15:05"), prefs, plan)).toEqual([]);
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

  it("makes the evening wrap a reminder when meal cards are still unconfirmed", () => {
    const n = dueNudges(snap(), ist("21:35"), prefs, null, ["2 roti and a dal katori"]);
    const wrap = n.find((x) => x.kind === "evening_wrap")!;
    expect(wrap).toMatchObject({ title: "A meal isn't logged yet", url: "/app/#coach" });
    expect(wrap.body).toBe('"2 roti and a dal katori" is waiting in chat. Tap Confirm & log, or it closes unlogged overnight.');
    const three = dueNudges(snap(), ist("21:35"), prefs, null, ["poha", "chai", "dal rice"]).find((x) => x.kind === "evening_wrap")!;
    expect(three.title).toBe("3 meals aren't logged yet");
    expect(three.body).toContain('"poha" and "chai" and 1 more are waiting');
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

describe("logging lapses (11 Nov design)", () => {
  const logging = (blankDays: number) => ({ lastLogDate: "2026-10-30", daysSinceLog: blankDays + 1, blankDays, loggedDays: 0, windowDays: 6, streak: 0 });

  it("nothing logged today: one catch-up after the first meal reminder, not one per meal", () => {
    const s = snap({ meals: [] });
    expect(dueNudges(s, ist("10:45"), prefs).map((x) => x.dedupeKey)).toEqual(["meal_reminder:breakfast:2026-11-02"]);
    expect(dueNudges(s, ist("14:40"), prefs).map((x) => x.dedupeKey)).toEqual(["meal_catchup:2026-11-02"]);
    expect(dueNudges(s, ist("21:20"), prefs).map((x) => x.dedupeKey)).toEqual(["meal_catchup:2026-11-02"]);
  });

  it("an unlogged day's evening wrap asks for the log instead of listing zeros", () => {
    const s = snap({ meals: [] });
    s.today = { ...s.today, unlogged: true, checks: [{ id: "meals_logged", label: "Meals logged", met: false, progress: 0, detail: "Nothing logged" }, s.today.checks[2]!] };
    const wrap = dueNudges(s, ist("21:35"), prefs).find((x) => x.kind === "evening_wrap")!;
    expect(wrap.title).toBe("Food not logged today");
    expect(wrap.body).toMatch(/^Nothing's logged yet/);
    expect(wrap.body).toBe("Nothing's logged yet. Tell me roughly what you ate, one line is enough. Also open: Steps (2,400 / 8,000).");
  });

  it("two blank days: the lapse message replaces meal reminders, and the morning plan drops 0/7 after four", () => {
    const s = snap({ meals: [], logging: logging(2) });
    expect(dueNudges(s, ist("14:40"), prefs).map((x) => x.kind)).toEqual([]);
    expect(dueNudges(s, ist("12:40"), prefs).map((x) => x.dedupeKey)).toEqual(["logging_nudge:2:2026-11-02"]);
    expect(dueNudges(snap({ logging: logging(4) }), ist("08:10"), prefs)[0]!.body).not.toMatch(/Week so far/);
    expect(dueNudges(s, ist("08:10"), prefs)[0]!.body).toMatch(/Week so far/);
  });

  it("no lapse message on days off the ladder, and it can be switched off", () => {
    expect(dueNudges(snap({ meals: [], logging: logging(4) }), ist("12:40"), prefs)).toEqual([]);
    expect(dueNudges(snap({ meals: [], logging: logging(3) }), ist("12:40"), parsePrefs({ off: ["logging_nudge"] }))).toEqual([]);
  });
});

describe("weigh-in push during a whole-plan pause", () => {
  const now = new Date("2026-11-12T03:00:00Z");
  it("goes out when none was sent before", () => expect(pauseWeighInAllowed(null, now)).toBe(true));
  it("doesn't repeat the next morning while still overdue", () => expect(pauseWeighInAllowed(new Date("2026-11-11T03:04:00Z"), now)).toBe(false));
  it("goes out again a week later", () => expect(pauseWeighInAllowed(new Date("2026-11-05T03:10:00Z"), now)).toBe(true));
});
