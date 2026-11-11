import { describe, expect, it } from "vitest";

import { buildDayMeals, dayMealLines, entryLite, type LoggedMeal, type PlanEntryLite } from "./dayMeals.js";
import { accountDay } from "./dietPlan/dayAccount.js";

const log = (id: string, slot: string, at: string, text: string, kcal: number, p = 10, c = 30, f = 10): LoggedMeal => ({
  mealSessionId: id, name: text, slot, text, loggedAt: `2026-11-05T${at}:00Z`, calories: kcal, proteinG: p, carbsG: c, fatG: f,
  items: [{ name: text, calories: kcal, proteinG: p, carbsG: c, fatG: f }],
});
const entry = (slot: PlanEntryLite["slot"], text: string, kcal: number, extra: Partial<PlanEntryLite> = {}): PlanEntryLite => ({
  slot, kind: "option", status: "planned", title: text, items: [{ text, kcal, proteinG: 10, carbsG: 30, fatG: 10 }], totals: { kcal, proteinG: 10, carbsG: 30, fatG: 10 }, ...extra,
});

// Saksham's 5 Nov: everything from the plan eaten, the planned milk snack replaced by chai and
// fafda logged in chat, then one more chai on top.
const plan: PlanEntryLite[] = [
  entry("dinner", "1½ katori white rice, chicken fry", 820, { status: "logged", loggedSessionId: "d" }),
  entry("breakfast", "1 katori sabudana khichdi", 354, { status: "logged", loggedSessionId: "b" }),
  entry("lunch", "1 bowl green salad, 3 medium roti, boondi raita", 600, { status: "partial", loggedSessionId: "l" }),
  entry("snack", "2 glasses double toned milk", 240, { status: "logged", loggedSessionId: "s1", offPlan: true }),
];
const logs = [
  log("s1", "snack", "16:57", "1 × cup Chai, ½ × Fafda · 4 pieces", 225),
  log("b", "breakfast", "17:01", "1 katori sabudana khichdi", 354),
  log("s2", "snack", "17:31", "one cup of chai", 71),
  log("l", "lunch", "18:02", "1 bowl green salad, 3 medium roti, boondi raita", 627),
  log("d", "dinner", "18:02", "1½ katori white rice, chicken fry", 855),
];

describe("buildDayMeals", () => {
  const day = buildDayMeals({ date: "2026-11-05", today: "2026-11-05", plan, logs, times: { snack: "17:00" } });

  it("lists the day once, in eating order, extras under their meal", () => {
    expect(day.rows.map((r) => [r.slot, r.state])).toEqual([
      ["breakfast", "eaten"],
      ["lunch", "eaten"],
      ["snack", "instead"],
      ["snack", "extra"],
      ["dinner", "eaten"],
    ]);
    expect(day.done).toBe(4);
    expect(day.planned).toBe(4);
    expect(day.extras).toBe(1);
  });

  it("shows what was eaten, not the planned food, for a replaced meal", () => {
    const snack = day.rows.find((r) => r.state === "instead")!;
    expect(snack.text).toContain("Chai");
    expect(snack.totals.kcal).toBe(225);
    expect(snack.insteadOf).toBe("2 glasses double toned milk");
    expect(snack.time).toBe("17:00");
  });

  it("uses logged numbers for eaten meals and flags changed portions", () => {
    const lunch = day.rows.find((r) => r.slot === "lunch")!;
    expect(lunch.totals.kcal).toBe(627);
    expect(lunch.changed).toBe(true);
    const dinner = day.rows.find((r) => r.slot === "dinner")!;
    expect(dinner.totals.kcal).toBe(855);
  });

  it("adds up to exactly what was logged, supplements and extras included", () => {
    expect(day.eaten.kcal).toBe(225 + 354 + 71 + 627 + 855);
    const rowsKcal = day.rows.reduce((a, r) => a + r.totals.kcal, 0);
    expect(rowsKcal).toBe(day.eaten.kcal);
    expect(day.toEat.kcal).toBe(0);
  });

  it("keeps meals still to come as planned, and counts them to eat", () => {
    const midday = buildDayMeals({
      date: "2026-11-05", today: "2026-11-05",
      plan: [entry("breakfast", "poha", 350, { status: "logged", loggedSessionId: "b" }), entry("dinner", "dal rice", 600), { ...entry("lunch", "Eating out", 700), kind: "eat_out", items: [] }],
      logs: [log("b", "breakfast", "08:30", "poha", 350)],
    });
    expect(midday.rows.map((r) => r.state)).toEqual(["eaten", "todo", "todo"]);
    expect(midday.rows[1]).toMatchObject({ slot: "lunch", eatOut: true, totals: { kcal: 700, proteinG: 0 } });
    expect(midday.toEat.kcal).toBe(1300);
    expect(midday.done).toBe(1);
  });

  it("marks past planned meals with nothing logged as not logged", () => {
    const past = buildDayMeals({ date: "2026-11-04", today: "2026-11-05", plan: [entry("dinner", "dal rice", 600)], logs: [] });
    expect(past.rows[0]!.state).toBe("missed");
    expect(past.toEat.kcal).toBe(0);
  });

  it("treats a meal whose log was removed as not eaten", () => {
    const d = buildDayMeals({ date: "2026-11-05", today: "2026-11-05", plan: [entry("dinner", "dal rice", 600, { status: "logged", loggedSessionId: "gone" })], logs: [] });
    expect(d.rows[0]!.state).toBe("todo");
    expect(d.eaten.kcal).toBe(0);
  });

  it("without a meal plan, every log is simply eaten", () => {
    const d = buildDayMeals({ date: "2026-11-05", today: "2026-11-05", plan: null, logs });
    expect(d.rows.every((r) => r.state === "eaten")).toBe(true);
    expect(d.extras).toBe(0);
    expect(d.rows[0]!.slot).toBe("breakfast");
  });

  it("calls their own food for an eat-out meal eaten, not instead", () => {
    const d = buildDayMeals({
      date: "2026-11-05", today: "2026-11-05",
      plan: [{ ...entry("lunch", "Eating out", 700, { status: "logged", loggedSessionId: "x", offPlan: true }), kind: "eat_out", items: [] }],
      logs: [log("x", "lunch", "13:00", "thali", 900)],
    });
    expect(d.rows[0]!.state).toBe("eaten");
  });
});

describe("accountDay with the day list", () => {
  const targets = { calories: 2400, proteinG: 120, carbsG: 300, fatG: 70 };
  it("matches the list: eaten is everything logged, planned is eaten plus still to eat", () => {
    const list = buildDayMeals({
      date: "2026-11-05", today: "2026-11-05",
      plan: [entry("snack", "milk", 240, { status: "logged", loggedSessionId: "s1", offPlan: true }), entry("dinner", "dal rice", 600)],
      logs: [log("s1", "snack", "16:57", "chai, fafda", 225), log("s2", "snack", "17:31", "chai", 71), log("w", "breakfast", "08:00", "Daily supplements", 120, 24, 3, 1)],
    });
    const a = accountDay({ date: "2026-11-05", targets, meals: [], supplements: [], list });
    expect(a.logged.kcal).toBe(225 + 71 + 120);
    expect(a.logged.meals).toBe(3);
    expect(a.planned.kcal).toBe(225 + 71 + 120 + 600);
    expect(a.unallocatedKcal).toBe(2400 - a.planned.kcal);
  });
});

describe("entryLite", () => {
  it("reads a plan entry row", () => {
    const e = entryLite({ meal_slot: "snack", status: "logged", title: "Milk", metadata: { kind: "option", items: [{ text: "2 glasses milk", kcal: 240 }], totals: { kcal: 240, proteinG: 16, carbsG: 20, fatG: 8 }, logged_session_id: "s1", off_plan: true } });
    expect(e).toMatchObject({ slot: "snack", offPlan: true, loggedSessionId: "s1", totals: { kcal: 240 } });
    expect(entryLite({ meal_slot: "brunch", status: "planned", title: "x", metadata: null })).toBeNull();
  });
});

describe("dayMealLines", () => {
  it("tells the coach the day in the app's words", () => {
    const lines = dayMealLines(buildDayMeals({ date: "2026-11-05", today: "2026-11-05", plan, logs }));
    expect(lines[2]).toContain("had instead of planned 2 glasses double toned milk");
    expect(lines[3]).toContain("extra, on top of the plan");
    expect(lines[1]).toContain("portions changed");
  });
});

describe("meal card plan line", () => {
  it("carries where a logged meal went onto its chat card", async () => {
    const { emptyCardStates, hydrateCard } = await import("./chatCards.js");
    const states = emptyCardStates();
    states.mealsLogged.set("s1", { calories: 225, plan: { role: "instead", slot: "snack", insteadOf: "2 glasses double toned milk" } });
    const card = hydrateCard({ type: "meal_draft", draft: { draftId: "s1" } } as never, states) as { saved?: { calories: number; plan?: { role: string } } };
    expect(card.saved).toEqual({ calories: 225, plan: { role: "instead", slot: "snack", insteadOf: "2 glasses double toned milk" } });
  });
});

describe("a skipped planned meal", () => {
  it("shows as skipped with 0 kcal and counts as done", () => {
    const list = buildDayMeals({ date: "2026-11-10", today: "2026-11-11", plan: [entry("lunch", "Dal, rice", 700, { status: "skipped" }), entry("dinner", "Roti, sabzi", 600)], logs: [] });
    const lunch = list.rows.find((r) => r.slot === "lunch")!;
    expect(lunch.state).toBe("skipped");
    expect(lunch.totals.kcal).toBe(0);
    expect(list.done).toBe(1);
    expect(list.rows.find((r) => r.slot === "dinner")!.state).toBe("missed");
    expect(dayMealLines(list)[0]).toMatch(/skipped/);
  });
});
