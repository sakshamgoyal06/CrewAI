import { describe, expect, it } from "vitest";

import { catalog } from "../../meals/catalog/index.js";
import { amountOf, groceryList } from "./grocery.js";

const item = (name: string, grams: number | null) => {
  const e = catalog().byKey.get(name);
  return { key: e?.key ?? null, name: e?.name ?? name, servingId: null, qty: 1, text: name, grams, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
};

describe("groceryList", () => {
  const meals = [
    { date: "2026-11-16", items: [item("roti", 80), item("dal tadka", 150), item("egg boiled", 100)] },
    { date: "2026-11-17", items: [item("rajma chawal", 350), item("curd", 150)] },
    { date: "2026-11-18", items: [item("curd", 150), item("homemade mystery mix", null)] },
    { date: "2026-11-18", kind: "eat_out", items: [] },
    { date: "2026-11-15", status: "eaten", items: [item("curd", 500)] },
  ];
  const g = groceryList(meals);
  const find = (name: string) => g.groups.flatMap((x) => x.items).find((i) => i.name === name);

  it("breaks dishes down to raw ingredients, as bought", () => {
    expect(find("Whole wheat flour (atta)")).toBeTruthy();
    expect(find("Rice")!.grams).toBeLessThan(150); // cooked rice is bought raw, about a third of the weight
    expect(find("Rajma")).toBeTruthy();
  });

  it("adds up the same food across meals, skips eaten meals and eat-outs", () => {
    expect(find("Curd")).toMatchObject({ grams: 300, amount: "300 g" });
    expect(g.meals).toBe(3);
  });

  it("counts eggs and groups by aisle", () => {
    expect(find("Eggs")!.amount).toBe("2 eggs");
    expect(g.groups.map((x) => x.group)).toContain("Dairy and eggs");
    expect(g.groups.find((x) => x.group === "Vegetables")).toBeTruthy();
  });

  it("lists items with no recipe or weight by name", () => {
    expect(g.loose).toEqual(["homemade mystery mix"]);
  });
});

describe("amountOf", () => {
  it("rounds to what a shop sells", () => {
    expect(amountOf(1240)).toBe("1.2 kg");
    expect(amountOf(333)).toBe("350 g");
    expect(amountOf(42)).toBe("40 g");
    expect(amountOf(1500, { ml: true })).toBe("1.5 L");
    expect(amountOf(260, { eggs: true })).toBe("5 eggs");
  });
});
