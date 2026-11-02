import { describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {}, redis: {}, anthropic: {} }));

import { draftFromUsual, rankUsualMeals, repeatUsualMeal, type LoggedSession, type UsualMeal } from "./frequentMeals.js";

const item = (name: string, calories: number, protein_g = 10) => ({ name, calories, protein_g, carbs_g: 20, fat_g: 5 });
let seq = 0;
function log(text: string, slot: string, localDate: string, items = [item(text, 300)]): LoggedSession {
  seq += 1;
  return { mealSessionId: `s${seq}`, text, slot, localDate, loggedAt: `${localDate}T0${seq % 10}:00:00Z`, source: "food_db", items };
}

const TODAY = "2026-11-02";

describe("rankUsualMeals", () => {
  const sessions = [
    log("Oats with whey and banana", "breakfast", "2026-11-01"),
    log("oats with whey  and banana", "breakfast", "2026-10-30"),
    log("Oats with whey and banana", "breakfast", "2026-10-28"),
    log("Chicken rice bowl", "lunch", "2026-11-01"),
    log("chicken rice bowl", "lunch", "2026-10-31"),
    log("Pizza", "dinner", "2026-10-20"),
  ];

  it("groups by text, needs 2+ logs, and leads with meals usually eaten now", () => {
    const lunch = rankUsualMeals(sessions, { today: TODAY, slot: "lunch" });
    expect(lunch.map((m) => m.text)).toEqual(["Chicken rice bowl", "Oats with whey and banana"]);
    expect(lunch[0]).toMatchObject({ count: 2, slot: "lunch", lastDate: "2026-11-01" });
    const breakfast = rankUsualMeals(sessions, { today: TODAY, slot: "breakfast" });
    expect(breakfast[0]).toMatchObject({ text: "Oats with whey and banana", count: 3 });
  });

  it("uses the items from the latest log, so a fixed portion stays fixed", () => {
    const fixed = [
      log("Paneer wrap", "lunch", "2026-10-25", [item("paneer wrap", 600)]),
      log("Paneer wrap", "lunch", "2026-11-01", [item("paneer wrap", 450, 22)]),
    ];
    const [m] = rankUsualMeals(fixed, { today: TODAY });
    expect(m!.items[0]!.calories).toBe(450);
    expect(m!.totals).toMatchObject({ calories: 450, protein_g: 22 });
  });

  it("skips meals with no items or text", () => {
    const empty = [log("x", "lunch", "2026-11-01", []), log("x", "lunch", "2026-10-31", [])];
    expect(rankUsualMeals(empty, { today: TODAY })).toEqual([]);
  });
});

const usual: UsualMeal = {
  key: "chicken rice bowl",
  text: "Chicken rice bowl",
  slot: "lunch",
  count: 4,
  lastDate: "2026-11-01",
  source: "food_db",
  items: [item("chicken", 250, 35), item("rice", 260, 5)],
  totals: { calories: 510, protein_g: 40, carbs_g: 40, fat_g: 10 },
};

describe("draftFromUsual", () => {
  it("makes a new draft id each time and copies the items", () => {
    const a = draftFromUsual(usual, "dinner");
    const b = draftFromUsual(usual, "dinner");
    expect(a.draftId).not.toBe(b.draftId);
    expect(a.slot).toBe("dinner");
    a.items[0]!.calories = 1;
    expect(usual.items[0]!.calories).toBe(250);
  });

  it("keeps a usual snack a snack", () => {
    expect(draftFromUsual({ ...usual, slot: "snack" }, "lunch").slot).toBe("snack");
  });
});

describe("repeatUsualMeal", () => {
  const ctx = { userProfileId: "p1", timezone: "UTC", now: new Date("2026-11-02T13:00:00Z") };

  it("posts a draft card into chat and never saves the meal", async () => {
    const record = vi.fn(async () => undefined);
    const r = await repeatUsualMeal(ctx, "chicken rice bowl", { usual: async () => ({ slot: "lunch", meals: [usual] }), record });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cards[0]).toMatchObject({ type: "meal_draft", draft: { text: "Chicken rice bowl", slot: "lunch", estimated: true } });
    expect(r.text).toContain("510 kcal");
    expect(r.changed).toBe(false);
    expect(record).toHaveBeenCalledWith("p1", "Usual: Chicken rice bowl", r.text, r.cards);
  });

  it("returns meal_not_found for an unknown key", async () => {
    const record = vi.fn(async () => undefined);
    const r = await repeatUsualMeal(ctx, "nope", { usual: async () => ({ slot: "lunch", meals: [usual] }), record });
    expect(r).toEqual({ ok: false, error: "meal_not_found" });
    expect(record).not.toHaveBeenCalled();
  });
});
