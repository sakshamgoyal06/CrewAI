import { describe, expect, it } from "vitest";
import { catalog } from "./index.js";
import { CUISINE, POPULARITY } from "./data/ranking.js";
import { groupByCuisine, searchCatalog } from "./search.js";

const names = (q: string, opts = {}) => searchCatalog(q, opts).map((h) => h.entry.name);

describe("ranking data", () => {
  it("names only real catalog entries", () => {
    const all = new Set(catalog().entries.map((e) => e.name));
    expect(Object.keys(POPULARITY).filter((n) => !all.has(n))).toEqual([]);
    expect(Object.keys(CUISINE).filter((n) => !all.has(n))).toEqual([]);
  });

  it("gives every entry a popularity and a cuisine", () => {
    for (const e of catalog().entries) {
      expect(e.popularity).toBeGreaterThanOrEqual(1);
      expect(e.popularity).toBeLessThanOrEqual(5);
      expect(e.cuisine).toBeTruthy();
    }
  });
});

describe("searchCatalog", () => {
  it("puts the everyday food first for a short query", () => {
    expect(names("dal")[0]).toBe("Dal tadka");
    expect(names("rot")[0]).toBe("Roti");
    expect(names("chi").slice(0, 3)).toContain("Chicken curry");
    expect(names("paneer")[0]).toBe("Paneer");
  });

  it("matches aliases and Hindi names", () => {
    expect(names("dahi")[0]).toBe("Curd");
    expect(names("chapati")[0]).toBe("Roti");
    expect(names("anda")).toContain("Egg roll");
  });

  it("ranks name matches above alias matches and leaves cooking ingredients out unless asked", () => {
    const hits = names("rice", { limit: 50 });
    expect(hits[0]).toBe("White rice, cooked");
    expect(hits.indexOf("Curd rice")).toBeLessThan(hits.indexOf("Idli")); // idli matches only by its alias "rice idli"
    expect(hits).not.toContain("Rice, raw");
    expect(names("rice", { limit: 50, eatenOnly: false })).toContain("Rice, raw");
  });

  it("filters by diet and meal", () => {
    expect(names("chicken", { diet: "veg" })).toEqual([]);
    expect(names("egg", { diet: "vegan" })).toEqual([]);
    expect(names("", { diet: "jain", limit: 100 }).filter((n) => /\b(onion|aloo|potato)/i.test(n))).toEqual([]);
    expect(searchCatalog("", { meal: "breakfast", limit: 30 }).every((h) => h.entry.meals.includes("breakfast"))).toBe(true);
  });

  it("lists the most popular foods for an empty query", () => {
    const top = names("", { limit: 10 });
    expect(top).toContain("Roti");
    expect(top).toContain("Chai");
  });

  it("lets real log counts lift a food", () => {
    const usage = new Map([["thalipeeth", 5000]]);
    const plain = names("th", { limit: 30 });
    const used = names("th", { limit: 30, usage });
    expect(used.indexOf("Thalipeeth")).toBeLessThan(plain.indexOf("Thalipeeth"));
  });

  it("groups by cuisine in the order of each group's best hit", () => {
    const groups = groupByCuisine(searchCatalog("dosa", { limit: 20 }));
    expect(groups[0]!.cuisine).toBe("south_indian");
    expect(groups.flatMap((g) => g.hits).length).toBe(searchCatalog("dosa", { limit: 20 }).length);
  });
});
