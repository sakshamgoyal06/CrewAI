import { beforeEach, describe, expect, it, vi } from "vitest";

const selectMock = vi.fn();
const updateMock = vi.fn();

vi.mock("../../tools/clients.js", () => ({
  supabase: {
    from: (table: string) => {
      if (table !== "meal_plan_entries") {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        select: (...args: unknown[]) => selectMock(...args),
        update: (...args: unknown[]) => updateMock(...args),
      };
    },
  },
}));

import { switchPlanSlots } from "./mealPlanStore.js";

function chainSelect(rows: unknown[]) {
  return {
    eq: () => ({
      eq: () => ({
        in: () => ({
          order: () => Promise.resolve({ data: rows, error: null }),
        }),
      }),
    }),
  };
}

function chainUpdate() {
  const eq = vi.fn().mockResolvedValue({ error: null });
  return { eq, promise: Promise.resolve({ error: null }) };
}

describe("switchPlanSlots", () => {
  beforeEach(() => {
    selectMock.mockReset();
    updateMock.mockReset();
  });

  it("swaps titles and descriptions between two planned slots", async () => {
    const lunch = {
      id: "l1",
      user_profile_id: "u1",
      local_date: "2026-08-10",
      meal_slot: "lunch",
      title: "Salad",
      description: "greens",
      status: "planned",
      linked_meal_session_id: null,
      source: "chat",
    };
    const dinner = {
      id: "d1",
      user_profile_id: "u1",
      local_date: "2026-08-10",
      meal_slot: "dinner",
      title: "Pasta",
      description: "tomato",
      status: "planned",
      linked_meal_session_id: null,
      source: "chat",
    };

    selectMock.mockReturnValue(chainSelect([lunch, dinner]));

    const lunchUpdate = chainUpdate();
    const dinnerUpdate = chainUpdate();
    updateMock
      .mockReturnValueOnce({ eq: lunchUpdate.eq })
      .mockReturnValueOnce({ eq: dinnerUpdate.eq });

    const result = await switchPlanSlots("u1", "2026-08-10", "lunch", "dinner");
    expect(result).toEqual({ ok: true });

    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(lunchUpdate.eq).toHaveBeenCalledWith("id", "l1");
    expect(dinnerUpdate.eq).toHaveBeenCalledWith("id", "d1");

    const lunchPayload = updateMock.mock.calls[0]![0];
    const dinnerPayload = updateMock.mock.calls[1]![0];
    expect(lunchPayload.title).toBe("Pasta");
    expect(lunchPayload.description).toBe("tomato");
    expect(dinnerPayload.title).toBe("Salad");
    expect(dinnerPayload.description).toBe("greens");
  });

  it("fails when a slot has no planned entry", async () => {
    selectMock.mockReturnValue(
      chainSelect([
        {
          id: "l1",
          user_profile_id: "u1",
          local_date: "2026-08-10",
          meal_slot: "lunch",
          title: "Salad",
          description: null,
          status: "planned",
          linked_meal_session_id: null,
          source: "chat",
        },
      ]),
    );

    const result = await switchPlanSlots("u1", "2026-08-10", "lunch", "dinner");
    expect(result).toEqual({ ok: false, error: "no planned dinner on 2026-08-10" });
    expect(updateMock).not.toHaveBeenCalled();
  });
});
