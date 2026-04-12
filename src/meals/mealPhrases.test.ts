import { describe, expect, it } from "vitest";

import { splitMealPhrases, stripLeadingMealLogVerb } from "./mealPhrases.js";

describe("stripLeadingMealLogVerb", () => {
  it("removes log after /meal capture", () => {
    expect(stripLeadingMealLogVerb("log 3 puri")).toBe("3 puri");
    expect(stripLeadingMealLogVerb("LOG rice")).toBe("rice");
  });

  it("keeps text that does not start with log", () => {
    expect(stripLeadingMealLogVerb("3 puri")).toBe("3 puri");
  });
});

describe("splitMealPhrases", () => {
  it("splits on commas", () => {
    expect(splitMealPhrases("a, b, c")).toEqual(["a", "b", "c"]);
  });

  it("strips leading and after comma", () => {
    expect(splitMealPhrases("a, and b")).toEqual(["a", "b"]);
  });

  it("splits on and when no comma", () => {
    expect(splitMealPhrases("3 puri and chole")).toEqual(["3 puri", "chole"]);
  });
});
