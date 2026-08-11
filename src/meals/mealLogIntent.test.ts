import { describe, expect, it } from "vitest";

import {
  isMealLogScaffoldingText,
  isMealPlanningIntent,
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
  it("strips Log breakfast: prefix", () => {
    expect(normalizeMealLogText("Log breakfast: masala omelette and 2 bread")).toBe(
      "masala omelette and 2 bread",
    );
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
