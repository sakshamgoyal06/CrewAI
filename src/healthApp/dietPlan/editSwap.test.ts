import { describe, expect, it, vi } from "vitest";

const entry = { id: "e1", metadata: { kind: "option", items: [] as unknown[] } };
const update = vi.fn(() => ({ eq: () => ({ eq: async () => ({ error: null }) }) }));
const chain: Record<string, unknown> = {};
for (const k of ["select", "eq"]) chain[k] = () => chain;
chain.limit = async () => ({ data: [entry], error: null });
vi.mock("../../tools/clients.js", () => ({ supabase: { from: () => ({ ...chain, update }) }, anthropic: {} }));
vi.mock("./store.js", () => ({ loadDietPrefs: async () => ({ prefs: {} }) }));
vi.mock("../onboarding.js", () => ({ loadFoodPrefs: async () => ({ diet: null, dietNote: null, foodAvoid: [] }) }));
vi.mock("./rules.js", () => ({ planRules: () => ({}), checkOn: () => () => true }));
const confirmMeal = vi.fn(async () => ({ ok: true, mealSessionId: "s1" }));
vi.mock("../actions.js", () => ({ confirmMeal: (...a: unknown[]) => confirmMeal(...(a as [])) }));

import * as edit from "./edit.js";


const ctx = { userProfileId: "u1", timezone: "Asia/Kolkata", now: new Date("2026-11-07T14:00:00Z") };

describe("editing a planned meal: plan change before its day, swap on it", () => {
  it("cuts off at midnight starting the meal's day", () => {
    expect(edit.editIsSwap("2026-11-08", "2026-11-07")).toBe(false);
    expect(edit.editIsSwap("2026-11-07", "2026-11-07")).toBe(true);
    expect(edit.editIsSwap("2026-11-06", "2026-11-07")).toBe(true);
  });

  it("on the day: logs what they had and leaves the plan alone", async () => {
    const r = await edit.editPick(ctx as never, "2026-11-07", "dinner", { items: [{ servingId: "roti:piece:medium", qty: 2 }] } as never);
    expect(r).toMatchObject({ ok: true, logged: true, mealSessionId: "s1" });
    expect(confirmMeal).toHaveBeenCalledWith(ctx, expect.objectContaining({ slot: "dinner", date: "2026-11-07", edited: true }));
    expect(update).not.toHaveBeenCalled();
  });
});
