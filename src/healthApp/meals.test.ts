import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  existing: [] as Array<{ id: string }>,
  inserted: [] as Array<Record<string, unknown>>,
  insertError: null as null | { message: string },
}));
const rollupMock = vi.hoisted(() => vi.fn(async () => ({ ok: true })));

vi.mock("../tools/clients.js", () => {
  const select = () => {
    const chain = {
      eq: () => chain,
      limit: async () => ({ data: db.existing, error: null }),
    };
    return chain;
  };
  return {
    supabase: {
      from: () => ({
        select,
        insert: async (rows: Array<Record<string, unknown>>) => {
          if (db.insertError) return { error: db.insertError };
          db.inserted.push(...rows);
          return { error: null };
        },
      }),
    },
    redis: {},
    anthropic: {},
  };
});
vi.mock("../nutrition/store/mealRollupStore.js", () => ({ recomputeDailyRollup: rollupMock }));

import type { MealNutritionEstimate } from "../meals/types.js";
import { draftMeal, estimateToItems, saveConfirmedMeal, slotForLocalHour, sumItems } from "./meals.js";

function est(over: Partial<MealNutritionEstimate> = {}): MealNutritionEstimate {
  return {
    calories: 520,
    protein_g: 30,
    carbs_g: 50,
    fat_g: 20,
    items: [],
    source: "usda_fdc",
    providerRaw: null,
    ...over,
  };
}

beforeEach(() => {
  db.existing = [];
  db.inserted = [];
  db.insertError = null;
  rollupMock.mockClear();
});

describe("estimateToItems", () => {
  it("uses provider lines when every line has calories", () => {
    const items = estimateToItems(
      est({
        items: [
          { name: "2 eggs", calories: 143.4, protein_g: 12.56, carbs_g: 0.7, fat_g: 9.5 },
          { name: "toast", calories: 80, protein_g: 3 },
        ],
      }),
      "2 eggs and toast",
    );
    expect(items).toEqual([
      { name: "2 eggs", calories: 143, protein_g: 12.6, carbs_g: 0.7, fat_g: 9.5 },
      { name: "toast", calories: 80, protein_g: 3, carbs_g: 0, fat_g: 0 },
    ]);
  });

  it("falls back to one line with the meal total when lines lack calories", () => {
    const items = estimateToItems(est({ items: [{ name: "dal" }, { name: "rice", calories: 200 }] }), "dal rice");
    expect(items).toEqual([{ name: "dal rice", calories: 520, protein_g: 30, carbs_g: 50, fat_g: 20 }]);
  });

  it("returns no items when nothing was estimated", () => {
    expect(estimateToItems(est({ calories: null, source: "unavailable" }), "x")).toEqual([]);
  });

  it("ignores negative or non-numeric values", () => {
    const items = estimateToItems(est({ protein_g: -3, fat_g: Number.NaN }), "x");
    expect(items[0]).toMatchObject({ protein_g: 0, fat_g: 0 });
  });
});

describe("slotForLocalHour", () => {
  it.each([
    [7, "breakfast"],
    [13, "lunch"],
    [17, "snack"],
    [20, "dinner"],
    [1, "snack"],
  ])("%i:00 -> %s", (hour, slot) => {
    expect(slotForLocalHour(hour)).toBe(slot);
  });
});

describe("draftMeal", () => {
  it("infers the slot from the user's local time and totals match the items", async () => {
    const draft = await draftMeal({
      text: "  chicken rice bowl ",
      timezone: "Asia/Kolkata",
      now: new Date("2026-10-27T07:30:00Z"), // 13:00 IST
      estimate: async () => est(),
    });
    expect(draft.text).toBe("chicken rice bowl");
    expect(draft.slot).toBe("lunch");
    expect(draft.estimated).toBe(true);
    expect(draft.totals).toEqual(sumItems(draft.items));
    expect(draft.draftId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("keeps an explicit slot and flags a failed estimate", async () => {
    const draft = await draftMeal({
      text: "mystery stew",
      slot: "dinner",
      timezone: "UTC",
      estimate: async () => est({ calories: null, source: "unavailable" }),
    });
    expect(draft.slot).toBe("dinner");
    expect(draft.estimated).toBe(false);
    expect(draft.items).toEqual([]);
  });
});

describe("saveConfirmedMeal", () => {
  const input = {
    draftId: "7b0c7a8e-2f55-4a8e-9a3b-0b6c1f1d2e3f",
    text: "2 eggs and toast",
    slot: "breakfast" as const,
    source: "usda_fdc" as const,
    items: [
      { name: "2 eggs", calories: 143, protein_g: 12.6, carbs_g: 0.7, fat_g: 9.5 },
      { name: "toast", calories: 80.4, protein_g: 3, carbs_g: 14, fat_g: 1 },
    ],
    edited: true,
    localDate: "2026-10-27",
  };

  it("saves exactly the confirmed items under the draft id and refreshes the rollup", async () => {
    const r = await saveConfirmedMeal("profile-1", input, new Date("2026-10-27T03:00:00Z"));
    expect(r).toEqual({
      ok: true,
      mealSessionId: input.draftId,
      localDate: "2026-10-27",
      totals: { calories: 223, protein_g: 15.6, carbs_g: 14.7, fat_g: 10.5 },
      alreadySaved: false,
    });
    expect(db.inserted).toHaveLength(2);
    expect(db.inserted.map((row) => row.calories)).toEqual([143, 80]);
    expect(db.inserted.every((row) => row.meal_session_id === input.draftId)).toBe(true);
    expect(db.inserted.map((row) => row.component_index)).toEqual([0, 1]);
    expect(db.inserted[0]).toMatchObject({
      local_date: "2026-10-27",
      meal_slot: "breakfast",
      source_channel: "api",
      provider_raw: { app_confirmed: true, user_edited: true },
    });
    expect(rollupMock).toHaveBeenCalledWith("profile-1", "2026-10-27");
  });

  it("does not insert again when the same draft is confirmed twice", async () => {
    db.existing = [{ id: "row-1" }];
    const r = await saveConfirmedMeal("profile-1", input);
    expect(r).toMatchObject({ ok: true, alreadySaved: true });
    expect(db.inserted).toHaveLength(0);
    expect(rollupMock).not.toHaveBeenCalled();
  });

  it("rejects an empty meal and reports insert errors", async () => {
    expect(await saveConfirmedMeal("profile-1", { ...input, items: [] })).toEqual({ ok: false, error: "no_items" });
    db.insertError = { message: "boom" };
    expect(await saveConfirmedMeal("profile-1", input)).toEqual({ ok: false, error: "boom" });
  });
});
