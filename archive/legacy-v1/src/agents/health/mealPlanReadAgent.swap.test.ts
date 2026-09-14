import { beforeEach, describe, expect, it, vi } from "vitest";

const switchPlanSlotsMock = vi.fn();
const getPlanEntriesForDateMock = vi.fn();

vi.mock("../../nutrition/store/mealPlanStore.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../nutrition/store/mealPlanStore.js")>();
  return {
    ...actual,
    switchPlanSlots: (...args: unknown[]) => switchPlanSlotsMock(...args),
    getPlanEntriesForDate: (...args: unknown[]) => getPlanEntriesForDateMock(...args),
  };
});

import { executeMealPlanReadCapability } from "./mealPlanReadAgent.js";
import { localDateKey } from "../../nutrition/localDate.js";

function ctx(raw: string) {
  return {
    userProfileId: "u1",
    telegramUserId: "t1",
    rawMessage: raw,
    intent: "HEALTH" as const,
    timezone: "Asia/Kolkata",
    healthPreferences: "",
    healthReferenceBlock: "",
  };
}

describe("executeMealPlanReadCapability meal_plan_swap", () => {
  beforeEach(() => {
    switchPlanSlotsMock.mockReset();
    getPlanEntriesForDateMock.mockReset();
  });

  it("exchanges two slots when parser passes exchange_with_slot args", async () => {
    switchPlanSlotsMock.mockResolvedValue({ ok: true });
    const today = localDateKey(new Date(), "Asia/Kolkata");
    getPlanEntriesForDateMock.mockResolvedValue([
      {
        id: "l1",
        user_profile_id: "u1",
        local_date: today,
        meal_slot: "lunch",
        title: "Pasta",
        description: null,
        status: "planned",
        linked_meal_session_id: null,
        source: "chat",
      },
      {
        id: "d1",
        user_profile_id: "u1",
        local_date: today,
        meal_slot: "dinner",
        title: "Salad",
        description: null,
        status: "planned",
        linked_meal_session_id: null,
        source: "chat",
      },
    ]);

    const out = await executeMealPlanReadCapability(ctx("switch lunch and dinner for today"), "meal_plan_swap", {
      slot: "lunch",
      exchange_with_slot: "dinner",
      date_hint: "today",
    });

    expect(switchPlanSlotsMock).toHaveBeenCalledWith("u1", today, "lunch", "dinner");
    expect(out.text).toMatch(/Switched \*\*lunch\*\* and \*\*dinner\*\*/);
    expect(out.text).toContain("Pasta");
    expect(out.text).toContain("Salad");
    expect(out.metadata).toMatchObject({ meal_plan: "swapped", slots: ["lunch", "dinner"] });
  });
});
