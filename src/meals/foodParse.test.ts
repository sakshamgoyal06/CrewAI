import { describe, expect, it } from "vitest";

import { foodKeyFor, parseMealComponents, stripFoodNotes } from "./foodParse.js";

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

  it("reads size words and household units without putting them in the key", () => {
    const sized = (t: string) => parseMealComponents(t).map((c) => [c.foodKey, c.quantity, c.unit, c.size ?? null]);
    expect(sized("2 large rotis, 1 small katori dal, a big bowl of rice, 2 ladles sambar, handful of almonds")).toEqual([
      ["roti", 2, "piece", "large"],
      ["dal", 1, "bowl", "small"],
      ["rice", 1, "bowl", "large"],
      ["sambar", 2, "ladle", null],
      ["almond", 1, "handful", null],
    ]);
  });

  it("gives plural and singular the same key", () => {
    expect(foodKeyFor("Rotis")).toBe(foodKeyFor("roti"));
    expect(foodKeyFor("2 boiled eggs!".replace(/^\d+\s*/, ""))).toBe("boiled egg");
    expect(foodKeyFor("dal")).toBe("dal");
    expect(foodKeyFor("glass")).toBe("glass");
  });
});

describe("notes in brackets (5 Nov: chai went to a 20 s web lookup, veg Whopper split off \"no beef\")", () => {
  it("drops descriptions so a known food is found", () => {
    expect(stripFoodNotes("one cup of chai (milky tea with sugar),")).toBe("one cup of chai,");
    expect(parseMealComponents("one cup of chai (milky tea with sugar),").map((c) => c.foodKey)).toEqual(["chai"]);
  });
  it("never splits a bracket's commas into foods", () => {
    const keys = parseMealComponents("1 Burger King Veg Whopper (vegetable patty, no beef), large peri peri fries, 1 Diet Coke").map((c) => c.foodKey);
    expect(keys).toEqual(["burger king veg whopper", "peri peri fry", "diet coke"]);
  });
  it("keeps an amount in brackets as the amount", () => {
    const [c] = parseMealComponents("chicken fry (about 150 g)");
    expect(c).toMatchObject({ foodKey: "chicken fry", quantity: 150 });
  });
});
