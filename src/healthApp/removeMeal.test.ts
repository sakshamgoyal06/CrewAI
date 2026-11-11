import { describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {}, anthropic: {} }));
const deleteMeal = vi.fn();
vi.mock("./meals.js", async (orig) => ({ ...(await orig<typeof import("./meals.js")>()), deleteMeal: (...a: unknown[]) => deleteMeal(...a) }));
const unlink = vi.fn(async () => {});
vi.mock("./dietPlan/log.js", () => ({ unlinkDeletedMeal: (...a: unknown[]) => unlink(...a) }));
const rebalance = vi.fn(async () => true);
vi.mock("./dietPlan/rhythm.js", () => ({ rebalanceToday: (...a: unknown[]) => rebalance(...a), afterMealLogged: vi.fn(), previewPlanRole: vi.fn() }));

import { removeMeal } from "./actions.js";

const ctx = { userProfileId: "u1", timezone: "Asia/Kolkata", now: new Date("2026-11-10T08:00:00Z") };
const sid = "6f1c2d3e-4a5b-4c6d-8e7f-001122334455";

describe("removeMeal", () => {
  it("unlinks the planned meal and rebalances when the meal was today's", async () => {
    deleteMeal.mockResolvedValueOnce({ ok: true, localDate: "2026-11-10" });
    expect(await removeMeal(ctx as never, sid)).toEqual({ ok: true, date: "2026-11-10" });
    expect(unlink).toHaveBeenCalledWith("u1", sid);
    expect(rebalance).toHaveBeenCalledTimes(1);
  });

  it("unlinks but doesn't rebalance for an earlier day", async () => {
    rebalance.mockClear();
    deleteMeal.mockResolvedValueOnce({ ok: true, localDate: "2026-11-08" });
    await removeMeal(ctx as never, sid);
    expect(rebalance).not.toHaveBeenCalled();
  });
});
