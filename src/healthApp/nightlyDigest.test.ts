import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ existing: false, inserted: [] as Array<Record<string, unknown>>, pushes: [] as Array<Record<string, unknown>> }));

vi.mock("../tools/clients.js", () => {
  const from = () => {
    const chain: Record<string, unknown> = {};
    for (const k of ["select", "eq"]) chain[k] = () => chain;
    chain.limit = async () => ({ data: db.existing ? [{ id: "x" }] : [], error: null });
    chain.insert = async (row: Record<string, unknown>) => {
      db.inserted.push(row);
      return { error: null };
    };
    return chain;
  };
  return { supabase: { from }, anthropic: {} };
});
vi.mock("./push.js", async (orig) => ({
  ...(await orig<typeof import("./push.js")>()),
  getPrefs: async () => ({ quietStart: "22:30", quietEnd: "07:00", off: [] }),
  sendNotification: async (_u: string, n: Record<string, unknown>) => {
    db.pushes.push(n);
    return { sent: true, delivered: 1 };
  },
}));

import { digestDue, digestFacts, digestFoodRules, fallbackDigest, runNightlyDigest, writeDigest } from "./nightlyDigest.js";
import type { HealthSnapshot } from "./snapshot.js";

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
        { id: "protein", label: "Protein", met: false, progress: 0.4, detail: "60 / 150 g" },
        { id: "steps", label: "Steps", met: true, progress: 1, detail: "9,000 / 8,000" },
      ],
      onTrack: false,
      score: 70,
      calories: 1900,
      proteinG: 60,
      steps: 9000,
      sleepMinutes: 420,
      isTrainingDay: true,
    },
    northStar: { onTrackDays: 3, windowDays: 7, goal: 5, days: [], mostMissed: null },
    targets: { calorieTarget: 2200, proteinTarget: 150, stepTarget: 8000, trainingDays: [1, 3], minMealSessions: 3 },
    workouts: [{ localDate: "2026-11-02" }],
    goal: null,
    meals: [{ mealSessionId: "a", slot: "lunch", text: "dal rice", calories: 700, proteinG: 20, loggedAt: "" }],
    ...over,
  } as HealthSnapshot;
}

describe("nightly digest", () => {
  beforeEach(() => {
    db.existing = false;
    db.inserted = [];
    db.pushes = [];
    delete process.env.MAGNUS_DIGEST;
  });

  it("is due from 21:30 for 90 minutes", () => {
    expect(digestDue(21 * 60 + 29)).toBe(false);
    expect(digestDue(21 * 60 + 30)).toBe(true);
    expect(digestDue(23 * 60)).toBe(false);
  });

  it("gives the model the day's numbers and tomorrow", () => {
    const f = digestFacts(snap(), 1);
    expect(f).toMatchObject({ today: "Monday", calories: "1,900 of 2,200 kcal", protein: "60 of 150 g", trainedToday: true, tomorrow: "Tuesday, rest day", sleepLastNight: "7.0 h" });
  });

  it("falls back to the first missed check and its fix", () => {
    expect(fallbackDigest(snap())).toBe("Today: protein missed (60 / 150 g). Tomorrow, put 30 g of protein into breakfast so the evening isn't a catch-up.");
  });

  it("uses the model's text, and the fallback when the call fails", async () => {
    const ok = await writeDigest({}, "fb", async () => ({ content: [{ type: "text", text: "Protein landed at 60 of 150 g. Tomorrow, add paneer at lunch." }], stop_reason: "end_turn" }) as never);
    expect(ok).toEqual({ text: "Protein landed at 60 of 150 g. Tomorrow, add paneer at lunch.", source: "model" });
    const failed = await writeDigest({}, "fb", async () => { throw new Error("down"); });
    expect(failed).toEqual({ text: "fb", source: "fallback" });
  });

  it("posts once at 21:30 and sends it as the evening push", async () => {
    const deps = { snapshot: async () => snap(), write: async () => ({ text: "Good steps, protein short at 60 g. Tomorrow, eggs at breakfast.", source: "model" as const }) };
    expect(await runNightlyDigest("u1", ist("21:00"), deps)).toBe("not_yet");
    expect(await runNightlyDigest("u1", ist("21:35"), deps)).toBe("posted");
    expect(db.inserted[0]).toMatchObject({ role: "assistant", content: "Good steps, protein short at 60 g. Tomorrow, eggs at breakfast." });
    expect(db.pushes[0]).toMatchObject({ kind: "evening_wrap", dedupeKey: "evening_wrap:2026-11-02", body: "Good steps, protein short at 60 g." });
    db.existing = true;
    expect(await runNightlyDigest("u1", ist("21:40"), deps)).toBe("exists");
  });

  it("skips days with nothing logged, and the off switch", async () => {
    const write = vi.fn();
    expect(await runNightlyDigest("u1", ist("21:35"), { snapshot: async () => snap({ meals: [] }), write })).toBe("nothing_logged");
    process.env.MAGNUS_DIGEST = "off";
    expect(await runNightlyDigest("u1", ist("21:35"), { snapshot: async () => snap(), write })).toBe("off");
    expect(write).not.toHaveBeenCalled();
  });

  // Saksham, 5 Nov: veg only till the 25th, yet the note said "150 g chicken" tomorrow.
  const saksham = { diet: "custom" as const, dietNote: "Vegetarian + chicken + eggs. No other meat than chicken", foodAvoid: ["Beef", "Pork"] };
  const vegTill25 = { restrictions: [], fastingDays: [], dietOverride: { diet: "vegetarian", from: "2026-11-05", until: "2026-11-25" } };

  it("puts a running temporary diet first in the note's food rules", () => {
    const r = digestFoodRules(saksham, vegTill25, "2026-11-05", "2026-11-06");
    expect(r.line).toMatch(/^TEMPORARY RULE until 2026-11-25, overriding their usual diet.*vegetarian \(no egg\)/);
    expect(r.line).toContain("usual diet:");
    expect(r.allows("Tomorrow, aim for a protein-first lunch of 150 g chicken with a green salad.")).toBe(false);
    expect(r.allows("Tomorrow, have two boiled eggs at breakfast.")).toBe(false);
    expect(r.allows("Tomorrow, have 150 g paneer with a green salad at lunch.")).toBe(true);
  });

  it("goes back to the usual diet once the period is over", () => {
    const r = digestFoodRules(saksham, vegTill25, "2026-11-26", "2026-11-27");
    expect(r.line).not.toContain("TEMPORARY");
    expect(r.allows("Tomorrow, 150 g chicken at lunch.")).toBe(true);
    expect(r.allows("Tomorrow, mutton curry at lunch.")).toBe(true); // the meat list is the model's job; only the diet and avoid list are checked here
    expect(digestFoodRules(saksham, null, "2026-11-26", "2026-11-27").allows("Tomorrow, pork ribs.")).toBe(false);
  });

  it("gives the model the temporary rule, and never posts a note that breaks it", async () => {
    db.existing = false;
    const rules = async () => digestFoodRules(saksham, vegTill25, "2026-11-02", "2026-11-03");
    const write = vi.fn(async () => ({ text: "Protein short at 60 g. Tomorrow, a protein-first lunch of 150 g chicken.", source: "model" as const }));
    expect(await runNightlyDigest("u1", ist("21:35"), { snapshot: async () => snap(), write, foodRules: rules })).toBe("posted");
    expect((write.mock.calls[0] as unknown[])[0]).toMatchObject({ foodRules: expect.stringMatching(/^TEMPORARY RULE/) });
    expect(db.inserted[0]!.content).toBe(fallbackDigest(snap()));
    expect(db.inserted[0]!.content).not.toMatch(/chicken/i);
  });
});
