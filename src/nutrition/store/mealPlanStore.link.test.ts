import { beforeEach, describe, expect, it, vi } from "vitest";

const selectMock = vi.fn();
const updateMock = vi.fn();

vi.mock("../../tools/clients.js", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "meal_plan_entries") {
        return {
          select: (...args: unknown[]) => selectMock(...args),
          update: (...args: unknown[]) => updateMock(...args),
        };
      }
      if (table === "meal_logs") {
        return {
          update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  },
}));

import { linkPlanEntryOnLog } from "./mealPlanStore.js";

describe("linkPlanEntryOnLog staple matching", () => {
  beforeEach(() => {
    selectMock.mockReset();
    updateMock.mockReset();
  });

  it("does not mark plan matched when staple differs (rice vs chapati)", async () => {
    selectMock.mockReturnValue({
      eq: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    id: "plan-1",
                    title: "Mix veg sabzi + moong dal + 1 katori rice",
                  },
                  error: null,
                }),
            }),
          }),
        }),
      }),
    });

    const result = await linkPlanEntryOnLog({
      userProfileId: "u1",
      localDate: "2026-08-12",
      mealSlot: "lunch",
      mealSessionId: "sess-1",
      rawMealText:
        "Indian lunch: mixed vegetable sabzi, moong dal curry, and 3 whole wheat chapatis",
    });

    expect(result.matched).toBe(false);
    expect(result.linked).toBe(false);
    expect(result.planTitle).toContain("rice");
  });
});
