import { describe, expect, it } from "vitest";

import { foodKeyFor, parseMealComponents } from "./foodParse.js";

const brief = (t: string) => parseMealComponents(t).map((c) => [c.foodKey, c.quantity, c.unit, c.assumedQuantity]);

describe("parseMealComponents", () => {
  it("splits a meal into foods with amounts", () => {
    expect(brief("2 parathas, a bowl of baingan sabzi and 100g curd")).toEqual([
      ["paratha", 2, "piece", false],
      ["baingan sabzi", 1, "bowl", false],
      ["curd", 100, "per_100g", false],
    ]);
  });

  it("handles words, fractions, ml/kg and no amount", () => {
    expect(brief("half bowl dal; 1/2 cup rice; 250 ml milk; 0.2 kg chicken; poha")).toEqual([
      ["dal", 0.5, "bowl", false],
      ["rice", 0.5, "cup", false],
      ["milk", 250, "per_100ml", false],
      ["chicken", 200, "per_100g", false],
      ["poha", 1, "serving", true],
    ]);
  });

  it("gives plural and singular the same key", () => {
    expect(foodKeyFor("Rotis")).toBe(foodKeyFor("roti"));
    expect(foodKeyFor("2 boiled eggs!".replace(/^\d+\s*/, ""))).toBe("boiled egg");
    expect(foodKeyFor("dal")).toBe("dal");
    expect(foodKeyFor("glass")).toBe("glass");
  });
});
