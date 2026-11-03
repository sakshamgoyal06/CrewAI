import { beforeEach, describe, expect, it, vi } from "vitest";

/** A tiny in-memory store for the tables ensureDayPlan touches. */
const db = vi.hoisted(() => ({
  messages: [] as Array<Record<string, unknown>>,
  profile: { display_name: "Saksham Goyal" } as Record<string, unknown> | null,
  health: { onboarded_at: "2026-10-20T08:00:00Z" } as Record<string, unknown> | null,
  goals: [{ id: "g1" }] as Array<Record<string, unknown>>,
}));

vi.mock("../tools/clients.js", () => {
  const select = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    const rows = () => {
      if (table === "health_chat_messages") return db.messages.filter((r) => filters.every(([k, v]) => r[k] === v));
      if (table === "health_goals") return db.goals;
      return [];
    };
    const q = {
      eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
      limit: async () => ({ data: rows(), error: null }),
      maybeSingle: async () => ({ data: table === "user_profile" ? db.profile : table === "user_health_profile" ? db.health : null, error: null }),
    };
    return q;
  };
  return {
    supabase: {
      from: (table: string) => ({
        select: () => select(table),
        insert: async (row: Record<string, unknown>) => {
          const dup = db.messages.some((r) => r.user_profile_id === row.user_profile_id && r.turn_id === row.turn_id && r.role === row.role);
          if (dup) return { error: { code: "23505", message: "duplicate key" } };
          db.messages.push({ created_at: new Date().toISOString(), ...row });
          return { error: null };
        },
      }),
    },
    redis: {},
    anthropic: {},
  };
});

const snapshotMock = vi.hoisted(() => ({ build: vi.fn() }));
vi.mock("./snapshot.js", () => ({ buildHealthSnapshot: snapshotMock.build }));
vi.mock("./interventions/store.js", () => ({ listInterventions: vi.fn(async () => []) }));

import {
  buildDayPlan,
  dayPlanText,
  ensureDayPlan,
  groupChatDays,
  localDayRange,
  localMidnight,
  morningTurnId,
  MOTIVATION,
  resetDayPlanMemo,
} from "./dailyChat.js";
import { historyToMessages } from "./chat.js";
import { BANNED } from "./interventions/options.js";
import type { Intervention } from "./interventions/types.js";
import type { HealthSnapshot } from "./snapshot.js";

const day = (date: string, onTrack: boolean, checks: HealthSnapshot["today"]["checks"] = []) => ({ date, onTrack, score: onTrack ? 100 : 50, checks });

function snap(over: Partial<HealthSnapshot> = {}): HealthSnapshot {
  return {
    timezone: "Asia/Kolkata",
    today: {
      date: "2026-11-04",
      checks: [],
      onTrack: false,
      score: 0,
      calories: 0,
      proteinG: 0,
      steps: 0,
      walkMinutes: null,
      sleepMinutes: 450,
      restingHr: null,
      totalKcal: null,
      hrvMs: null,
      isTrainingDay: true,
      routine: [
        { itemId: "w", label: "Morning walk", activityKey: "walking", startTime: "07:00", durationMin: 30, gym: false, state: "pending", detail: "" },
        { itemId: "g", label: "Gym", activityKey: "gym", startTime: "18:30", durationMin: 60, gym: true, state: "pending", detail: "" },
      ],
    },
    routine: [],
    northStar: {
      onTrackDays: 3,
      windowDays: 7,
      goal: 5,
      days: [
        day("2026-11-03", false, [
          { id: "meals_logged", label: "Meals logged", met: true, progress: 1, detail: "3/3 meals" },
          { id: "protein", label: "Protein", met: false, progress: 0.6, detail: "90 / 150 g" },
          { id: "steps", label: "Steps", met: true, progress: 1, detail: "9,000 / 8,000" },
        ]),
        day("2026-11-04", false),
      ],
      mostMissed: { id: "protein", label: "Protein", missedDays: 3 },
    },
    targets: { calorieTarget: 2200, proteinTarget: 150, stepTarget: 8000, trainingDays: [3], minMealSessions: 3 },
    workouts: [],
    hevyConnected: true,
    gym: { time: "18:30", checkDelayMin: 180, checkAt: "21:30" },
    workoutChecks: [],
    recentSkips: [],
    goal: {
      goal: { id: "g1", startDate: "2026-10-01", deadline: "2027-01-15", targets: { weight_kg: 78 } },
      weeksLeft: 10,
      daysLeft: 72,
      metrics: [
        { metric: "weight_kg", label: "Weight", unit: "kg", start: 85, latest: 82.4, latestDate: "2026-11-01", target: 78, progress: 0.37, requiredPerWeek: -0.44, actualPerWeek: -0.5, pace: "on_pace", projectedDate: "2027-01-10" },
      ],
      checkinDue: false,
      lastCheckinDate: "2026-11-01",
    },
    checkins: [],
    activities: [],
    meals: [],
    ...over,
  } as HealthSnapshot;
}

describe("local days", () => {
  it("finds local midnight in a +5:30 zone and in UTC", () => {
    expect(localMidnight("2026-11-04", "Asia/Kolkata").toISOString()).toBe("2026-11-03T18:30:00.000Z");
    expect(localMidnight("2026-11-04", "UTC").toISOString()).toBe("2026-11-04T00:00:00.000Z");
    expect(localDayRange("2026-11-04", "Asia/Kolkata")).toEqual({ from: "2026-11-03T18:30:00.000Z", to: "2026-11-04T18:30:00.000Z" });
  });

  it("handles a DST day (23 hours long)", () => {
    const r = localDayRange("2026-03-08", "America/New_York");
    expect(r.from).toBe("2026-03-08T05:00:00.000Z");
    expect(r.to).toBe("2026-03-09T04:00:00.000Z");
  });

  it("groups earlier days newest first, previewing the person's first message", () => {
    const rows = [
      { role: "assistant", content: "Good morning. Today's plan…", createdAt: "2026-11-02T01:00:00Z" },
      { role: "user", content: "I had   poha and chai\nfor breakfast", createdAt: "2026-11-02T03:00:00Z" },
      { role: "assistant", content: "Logged.", createdAt: "2026-11-02T03:00:05Z" },
      { role: "assistant", content: "Plan for Tuesday", createdAt: "2026-11-03T01:00:00Z" },
      // 00:30 IST on the 4th: today, so left out.
      { role: "user", content: "late snack", createdAt: "2026-11-03T19:00:00Z" },
    ];
    expect(groupChatDays(rows, "Asia/Kolkata", "2026-11-04")).toEqual([
      { date: "2026-11-03", count: 1, preview: "Plan for Tuesday" },
      { date: "2026-11-02", count: 3, preview: "I had poha and chai for breakfast" },
    ]);
  });
});

describe("the day's plan", () => {
  it("gives a stable, valid uuid per person per day", () => {
    const a = morningTurnId("u1", "2026-11-04");
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(morningTurnId("u1", "2026-11-04")).toBe(a);
    expect(morningTurnId("u1", "2026-11-05")).not.toBe(a);
    expect(morningTurnId("u2", "2026-11-04")).not.toBe(a);
  });

  it("builds plan, targets, goal, yesterday, week and focus from stored data", () => {
    const { card, text } = buildDayPlan({ snapshot: snap(), name: "Saksham", localHour: 6, intervention: null });
    expect(card).toMatchObject({
      type: "day_plan",
      date: "2026-11-04",
      greeting: "Good morning, Saksham",
      plan: [{ time: "7:00 am", label: "Morning walk" }, { time: "6:30 pm", label: "Gym" }],
      dayKind: null,
      targets: [{ value: "2,200", label: "kcal" }, { value: "150 g", label: "protein" }, { value: "8,000", label: "steps" }],
      goal: "Weight: 82.4 kg now, 78 kg by 15 Jan · on pace",
      yesterday: "2 of 3 checks. Open: protein (90 / 150 g).",
      week: "3 of the last 7 days on track (aim: 5)",
    });
    expect(card.focus).toContain("Protein slipped on 3 of the last 6 days");
    expect(text.split("\n")[0]).toBe("Good morning, Saksham. Today's plan for Wed 4 Nov.");
    expect(text).toContain("Today: Morning walk 7:00 am · Gym 6:30 pm.");
  });

  it("puts an open plan-change offer first, then a due weigh-in", () => {
    const iv = { title: "Make the evening gym easier to keep" } as Intervention;
    expect(buildDayPlan({ snapshot: snap(), name: null, localHour: 9, intervention: iv }).card.focus).toBe(
      "One thing to decide: Make the evening gym easier to keep. The options are below.",
    );
    const s = snap();
    s.goal!.checkinDue = true;
    expect(buildDayPlan({ snapshot: s, name: null, localHour: 9, intervention: null }).card.focus).toMatch(/^Weekly weigh-in today/);
  });

  it("says rest day without a routine, and greets by time of day", () => {
    const s = snap();
    s.today.routine = [];
    s.today.isTrainingDay = false;
    const { card } = buildDayPlan({ snapshot: s, name: null, localHour: 14, intervention: null });
    expect(card.plan).toEqual([]);
    expect(card.dayKind).toMatch(/^Rest day/);
    expect(card.greeting).toBe("Good afternoon");
    expect(dayPlanText(card)).toContain("Today: Rest day");
  });

  it("celebrates a streak instead of a stock line", () => {
    const s = snap();
    s.northStar.days = [day("a", true), day("b", true), day("c", true), day("2026-11-04", false)];
    expect(buildDayPlan({ snapshot: s, name: null, localHour: 7, intervention: null }).card.motivation).toBe("3 days on track in a row. Keep the chain going today.");
  });

  it("never uses guilt words", () => {
    for (const line of MOTIVATION) expect(line, line).not.toMatch(BANNED);
  });
});

describe("ensureDayPlan", () => {
  // 06:10 IST on 4 Nov.
  const morning = new Date("2026-11-04T00:40:00Z");
  beforeEach(() => {
    db.messages = [];
    db.health = { onboarded_at: "2026-10-20T08:00:00Z" };
    resetDayPlanMemo();
    snapshotMock.build.mockReset();
    snapshotMock.build.mockResolvedValue(snap());
  });

  it("posts once a day, however many callers try", async () => {
    expect(await ensureDayPlan("u1", "Asia/Kolkata", morning)).toBe("posted");
    expect(await ensureDayPlan("u1", "Asia/Kolkata", morning)).toBe("exists");
    resetDayPlanMemo();
    expect(await ensureDayPlan("u1", "Asia/Kolkata", morning)).toBe("exists");
    expect(db.messages).toHaveLength(1);
    expect(db.messages[0]).toMatchObject({ role: "assistant", status: "ok", turn_id: morningTurnId("u1", "2026-11-04") });
    expect((db.messages[0]!.cards as Array<{ type: string }>)[0]!.type).toBe("day_plan");
  });

  it("waits until morning, and skips the day someone onboards", async () => {
    expect(await ensureDayPlan("u1", "Asia/Kolkata", new Date("2026-11-03T21:00:00Z"))).toBe("too_early"); // 02:30 IST
    db.health = { onboarded_at: "2026-11-04T00:20:00Z" };
    expect(await ensureDayPlan("u1", "Asia/Kolkata", morning)).toBe("not_ready");
    expect(db.messages).toHaveLength(0);
  });
});

describe("history across the daily split", () => {
  it("marks where each local day starts and flags the plan as posted by the app", () => {
    const msgs = historyToMessages(
      [
        { role: "user", content: "had eggs", createdAt: "2026-11-03T03:00:00Z" },
        { role: "assistant", content: "Logged.", createdAt: "2026-11-03T03:00:05Z" },
        { role: "assistant", content: "Good morning. Today's plan…", turnId: "x", createdAt: "2026-11-04T00:40:00Z", cards: [{ type: "day_plan" } as never] },
        { role: "user", content: "had oats", createdAt: "2026-11-04T02:00:00Z" },
      ],
      undefined,
      "Asia/Kolkata",
    );
    expect(msgs.map((m) => m.content)).toEqual([
      "[Tue 3 Nov]\nhad eggs",
      "Logged.\n\n[Wed 4 Nov]\n[Posted by the app on its own, not in reply to the person]\nGood morning. Today's plan…",
      "had oats",
    ]);
  });
});
