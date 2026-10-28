import { describe, expect, it } from "vitest";

import { mealSessionTextSimilarity, findDuplicateSession } from "./mealSessionSimilarity.js";
import type { MealSessionSummary } from "../nutrition/store/mealHistoryStore.js";

describe("mealSessionSimilarity", () => {
  it("detects near-duplicate burrito logs", () => {
    const a = "a crispy chicken California burrito bowl for lunch and a diet coke";
    const b = "crispy chicken california burrito bowl for lunch and diet coke";
    expect(mealSessionTextSimilarity(a, b)).toBeGreaterThan(0.7);
  });

  it("findDuplicateSession returns recent match", () => {
    const sessions: MealSessionSummary[] = [
      {
        mealSessionId: "sess-1",
        localDate: "2026-08-12",
        mealSlot: "lunch",
        logKind: "meal",
        rawText: "crispy chicken california burrito bowl for lunch",
        calories: 830,
        protein_g: 47,
        carbs_g: 85,
        fat_g: 32,
        loggedAt: new Date().toISOString(),
        componentCount: 2,
      },
    ];
    const dup = findDuplicateSession(
      "a crispy chicken California burrito bowl for lunch and a diet coke",
      sessions,
      { sameSlotOnly: true, mealSlot: "lunch" },
    );
    expect(dup?.mealSessionId).toBe("sess-1");
  });
});
