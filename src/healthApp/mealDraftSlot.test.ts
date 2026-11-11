import { describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {}, anthropic: {} }));
vi.mock("./webLookups.js", () => ({ webGateFor: async () => ({ allowed: true, onLookup: () => {} }) }));
vi.mock("./accounts.js", () => ({ isOwnerProfile: async () => false }));
const draftMeal = vi.fn();
vi.mock("./meals.js", async (orig) => ({ ...(await orig<typeof import("./meals.js")>()), draftMeal: (...a: unknown[]) => draftMeal(...a) }));
const preview = vi.fn(async (_u: string, _d: string, slot: string) => ({ role: "instead", insteadOf: `planned ${slot}` }));
vi.mock("./dietPlan/rhythm.js", () => ({ previewPlanRole: (...a: [string, string, string]) => preview(...a), afterMealLogged: vi.fn(), rebalanceToday: vi.fn(), redoCarry: vi.fn() }));

import { draftDayFor, startMealDraft } from "./actions.js";

const ctx = { userProfileId: "u1", timezone: "Asia/Kolkata", now: new Date("2026-11-10T16:26:00Z") };
const base = (slot: string) => ({ draftId: "d1", text: "x", slot, source: "food_db", items: [], totals: {}, estimated: true, servingAssumption: null });

describe("startMealDraft: which meal", () => {
  it("asks when no meal is named, with the plan role for each meal", async () => {
    draftMeal.mockImplementationOnce(async (i: { slot?: string }) => base(i.slot ?? "dinner"));
    const d = await startMealDraft(ctx as never, { text: "I had 2 roti and a dal katori today", items: [] } as never);
    expect(d.slotUnsure).toBe(true);
    expect(d.plan).toBeUndefined();
    expect(Object.keys(d.planBySlot ?? {}).sort()).toEqual(["breakfast", "dinner", "lunch", "snack"]);
  });

  it("doesn't ask when the message names the meal, or the coach passes one", async () => {
    draftMeal.mockImplementation(async (i: { slot?: string }) => base(i.slot ?? "dinner"));
    const a = await startMealDraft(ctx as never, { text: "2 roti and dal for lunch" } as never);
    expect(a.slotUnsure).toBeUndefined();
    expect(a.plan).toEqual({ role: "instead", insteadOf: "planned lunch" });
    const b = await startMealDraft(ctx as never, { text: "poha", slot: "breakfast" } as never);
    expect(b.slotUnsure).toBeUndefined();
  });

  it("never asks for a single-food web lookup", async () => {
    const d = await startMealDraft(ctx as never, { text: "veg whopper" } as never, { webFirst: true });
    expect(d.slotUnsure).toBeUndefined();
  });
});

describe("draftDayFor", () => {
  it("uses the date given, or yesterday from the text, and never a future or far-off day", () => {
    expect(draftDayFor({}, "2026-11-11")).toBe("2026-11-11");
    expect(draftDayFor({ yesterday: true }, "2026-11-11")).toBe("2026-11-10");
    expect(draftDayFor({ date: "2026-11-08", yesterday: true }, "2026-11-11")).toBe("2026-11-08");
    expect(draftDayFor({ date: "2026-11-12" }, "2026-11-11")).toBe("2026-11-11");
    expect(draftDayFor({ date: "2026-09-01" }, "2026-11-11")).toBe("2026-11-11");
  });

  it("previews the plan role on the day the meal is for", async () => {
    preview.mockClear();
    draftMeal.mockImplementation(async (i: { slot?: string }) => base(i.slot ?? "dinner"));
    const d = await startMealDraft(ctx as never, { text: "yesterday 2 roti and dal for lunch" } as never);
    expect(d.date).toBe("2026-11-09");
    expect(preview).toHaveBeenCalledWith("u1", "2026-11-09", "lunch", { extra: false });
  });
});
