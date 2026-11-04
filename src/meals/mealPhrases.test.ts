import { describe, expect, it } from "vitest";

import { mealContext, splitMealPhrases, stripLeadingMealLogVerb } from "./mealPhrases.js";

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

describe("mealContext", () => {
  it("takes the slot and filler words out of a typed meal", () => {
    expect(mealContext("poha for breakfast")).toEqual({ text: "poha", slot: "breakfast" });
    expect(mealContext("I had 2 roti and dal for lunch today")).toEqual({ text: "2 roti and dal", slot: "lunch" });
    expect(mealContext("ate chicken biryani at dinner")).toEqual({ text: "chicken biryani", slot: "dinner" });
    expect(mealContext("just had a banana as a snack")).toEqual({ text: "a banana", slot: "snack" });
    expect(mealContext("masala dosa with sambar")).toEqual({ text: "masala dosa with sambar" });
    expect(mealContext("for lunch")).toEqual({ text: "for lunch", slot: "lunch" });
  });
});
