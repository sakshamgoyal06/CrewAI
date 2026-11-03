import { describe, expect, it } from "vitest";

import { CASES } from "./cases.js";
import { score } from "./score.js";

describe("eval scoring", () => {
  const meal = CASES.find((c) => c.id === "log-meal-2-roti-dal-salad-for-lunch")!;

  it("passes the right tool call with a card line, and fails a claim of logging", () => {
    const calls = [{ name: "draft_meal", input: { text: "2 roti, dal, salad", slot: "lunch" } }];
    expect(score(meal, "About 520 kcal. Check the card and confirm.", calls)).toEqual([]);
    expect(score(meal, "Logged your lunch, 520 kcal.", calls)).toEqual(["reply matches forbidden /\\b(logged|saved|recorded|added|applied|updated|done)\\b(?! yet)/i"]);
    expect(score(meal, "Check the card.", [{ name: "log_steps", input: { steps: 2 } }])).toEqual([
      "missing draft_meal with the expected input (got log_steps {\"steps\":2})",
      "must not call log_steps",
    ]);
  });

  it("caps length and format", () => {
    const thanks = CASES.find((c) => c.id === "honest-no-card-mention")!;
    expect(score(thanks, "Any time. Shout when you've eaten.", [])).toEqual([]);
    expect(score(thanks, "One. Two. Three.", [])).toEqual(["3 sentences (cap 2)"]);
    expect(score(thanks, "# Plan\n- a", [])).toContain("headings or bullets");
  });

  it("has the case counts the brief asked for", () => {
    const by = (cat: string) => CASES.filter((c) => c.category === cat).length;
    expect(by("logging")).toBeGreaterThanOrEqual(40);
    expect(by("coaching")).toBeGreaterThanOrEqual(20);
    expect(by("state_honesty")).toBeGreaterThanOrEqual(15);
    expect(by("failure")).toBeGreaterThanOrEqual(10);
    expect(by("safety")).toBeGreaterThanOrEqual(10);
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
  });
});
