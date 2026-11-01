import { describe, expect, it } from "vitest";

import { parseBreakdown } from "./webBreakdown.js";

describe("parseBreakdown", () => {
  it("maps units and drops broken ingredients", () => {
    const r = parseBreakdown(`{"items":[{"index":1,"ingredients":[
      {"food":"White rice, cooked","unit":"g","quantity":150,"per_unit":{"calories":130,"protein_g":2.7,"carbs_g":28,"fat_g":0.3}},
      {"food":"Bread","unit":"slice","quantity":2,"per_unit":{"calories":70,"protein_g":2.5,"carbs_g":13,"fat_g":1},"grams_per_unit":28},
      {"food":"Mystery","unit":"handful","quantity":1,"per_unit":{"calories":50}}
    ]}],"serving_assumption":"x"}`)!;
    expect(r.items.get(1)!.map((i) => [i.food, i.unit, i.quantity, i.grams_per_unit])).toEqual([
      ["White rice, cooked", "per_100g", 150, null],
      ["Bread", "slice", 2, 28],
    ]);
    expect(r.serving_assumption).toBe("x");
  });
});
