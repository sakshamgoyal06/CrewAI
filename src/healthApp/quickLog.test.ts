import { describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {}, anthropic: {} }));

import type { MealDraft } from "./meals.js";
import { isConfidentDraft, logDraftNow, quickLogOn } from "./quickLog.js";

const draft = (o: Partial<MealDraft> = {}): MealDraft => ({
  draftId: "11111111-1111-4111-8111-111111111111",
  text: "2 idli, sambar",
  slot: "breakfast",
  source: "food_db",
  items: [{ name: "Idli", calories: 120, protein_g: 4, carbs_g: 24, fat_g: 1 }, { name: "Sambar", calories: 140, protein_g: 7, carbs_g: 18, fat_g: 4 }],
  totals: { calories: 260, protein_g: 11, carbs_g: 42, fat_g: 5 },
  estimated: true,
  servingAssumption: null,
  ...o,
});
const ctx = { userProfileId: "p1", timezone: "Asia/Kolkata" };

describe("isConfidentDraft", () => {
  it("is sure about database numbers with a known meal", () => {
    expect(isConfidentDraft(draft())).toBe(true);
  });
  it("waits for a confirm on a model or web estimate, a missing item, or an unknown meal", () => {
    expect(isConfidentDraft(draft({ source: "llm_estimate" }))).toBe(false);
    expect(isConfidentDraft(draft({ source: "web_research" }))).toBe(false);
    expect(isConfidentDraft(draft({ items: [{ name: "Thing", calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, missing: true }] }))).toBe(false);
    expect(isConfidentDraft(draft({ slotUnsure: true }))).toBe(false);
    expect(isConfidentDraft(draft({ slot: "unspecified" }))).toBe(false);
    expect(isConfidentDraft(draft({ estimated: false }))).toBe(false);
  });
});

describe("logDraftNow", () => {
  it("confirms the draft as it is and returns the card in its logged state", async () => {
    const confirm = vi.fn(async () => ({ ok: true as const, mealSessionId: "s1", localDate: "2026-11-12", totals: { calories: 260, protein_g: 11, carbs_g: 42, fat_g: 5 }, alreadySaved: false }));
    const card = await logDraftNow(ctx, draft({ extra: true, date: "2026-11-12" }), confirm as never);
    expect(confirm).toHaveBeenCalledWith(ctx, expect.objectContaining({ draftId: draft().draftId, slot: "breakfast", source: "food_db", edited: false, extra: true, date: "2026-11-12" }));
    expect(card).toMatchObject({ type: "meal_draft", saved: { calories: 260 }, draft: { autoLogged: true } });
  });
  it("returns null (the draft stays to confirm) when the save fails or throws", async () => {
    expect(await logDraftNow(ctx, draft(), (async () => ({ ok: false, error: "db" })) as never)).toBeNull();
    expect(await logDraftNow(ctx, draft(), (async () => { throw new Error("down"); }) as never)).toBeNull();
  });
});

describe("quickLogOn", () => {
  it("is on unless MAGNUS_QUICK_LOG=off", () => {
    expect(quickLogOn({})).toBe(true);
    expect(quickLogOn({ MAGNUS_QUICK_LOG: "off" })).toBe(false);
  });
});
