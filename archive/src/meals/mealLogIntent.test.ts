import { describe, expect, it } from "vitest";

import {
  extractPastMealFoodText,
  inferMealLogCandidate,
  isMealLogScaffoldingText,
  isMealPlanningIntent,
  isMealSlotCorrectionMessage,
  normalizeMealLogText,
} from "./mealLogIntent.js";

describe("isMealPlanningIntent", () => {
  it("detects future-tense day menus", () => {
    expect(
      isMealPlanningIntent(
        "Today breakfast ill eat poha and sunny side up egg. Lunch will be moong dal and aloo palak.",
      ),
    ).toBe(true);
  });

  it("allows past-tense recounts", () => {
    expect(
      isMealPlanningIntent(
        "For breakfast today i just had a tea\nFor lunch i had 2 plain parathas",
      ),
    ).toBe(false);
  });

  it("allows explicit ate messages", () => {
    expect(isMealPlanningIntent("I ate a samosa just now, and a tea")).toBe(false);
  });
});

describe("normalizeMealLogText", () => {
  it("rejects parser Log breakfast: scaffolding", () => {
    expect(normalizeMealLogText("Log breakfast: masala omelette and 2 bread")).toBeNull();
  });

  it("rejects meta scaffolding", () => {
    expect(normalizeMealLogText("Log samosa and tea as a meal entry")).toBeNull();
    expect(normalizeMealLogText("It is not 1930 calories.")).toBeNull();
  });
});

describe("isMealLogScaffoldingText", () => {
  it("flags parser log-slot lines without food", () => {
    expect(isMealLogScaffoldingText("Log afternoon tea")).toBe(true);
  });
});

describe("extractPastMealFoodText", () => {
  it("pulls food from I ate / I had messages", () => {
    expect(extractPastMealFoodText("I ate a samosa just now, and a tea")).toBe(
      "a samosa just now, and a tea",
    );
    expect(extractPastMealFoodText("I had 2 parathas with raita")).toBe("2 parathas with raita");
  });

  it("finds ate/had after a meal-slot preamble", () => {
    expect(
      extractPastMealFoodText("For breakfast today, I ate 2 besan cheelas, ketchup, and a tea"),
    ).toBe("2 besan cheelas, ketchup, and a tea");
  });

  it("handles present-tense having", () => {
    expect(
      extractPastMealFoodText("For breakfast today, I am having 2 besan cheelas, ketchup, and a tea"),
    ).toBe("2 besan cheelas, ketchup, and a tea");
  });
});

describe("inferMealLogCandidate", () => {
  it("proposes food text when phrasing is ambiguous", () => {
    expect(
      inferMealLogCandidate("For breakfast today, I am having 2 besan cheelas and tea"),
    ).toEqual(
      expect.objectContaining({ foodText: expect.stringContaining("besan cheelas") }),
    );
  });
});

describe("isMealPlanningIntent", () => {
  it("does not treat present having as meal planning", () => {
    expect(
      isMealPlanningIntent("For breakfast today, I am having 2 besan cheelas and tea"),
    ).toBe(false);
  });
});

describe("isMealSlotCorrectionMessage", () => {
  it("detects timing corrections without new food", () => {
    expect(
      isMealSlotCorrectionMessage(
        "Samosa and tea was in evening and not mid morning. And lunch had a tea too",
      ),
    ).toBe(true);
  });

  it("allows new meal logs with ate/had", () => {
    expect(isMealSlotCorrectionMessage("For dinner i just ate rice and daal")).toBe(false);
  });
});
