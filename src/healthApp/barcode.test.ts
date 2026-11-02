import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {}, redis: {}, anthropic: {} }));

import {
  _clearBarcodeCache,
  draftFromProduct,
  draftMealFromBarcode,
  lookupBarcode,
  parseOffProduct,
  type BarcodeProduct,
} from "./barcode.js";

const offMaggi = {
  product_name: "Masala Noodles",
  brands: "Maggi, Nestlé",
  serving_size: "70 g",
  serving_quantity: 70,
  product_quantity: 70,
  nutriments: { "energy-kcal_100g": 427, proteins_100g: 8.6, carbohydrates_100g: 62, fat_100g: 15.7 },
};

const ctx = { userProfileId: "p1", timezone: "Asia/Kolkata", now: new Date("2026-11-02T07:30:00Z") };

beforeEach(() => _clearBarcodeCache());

describe("parseOffProduct", () => {
  it("reads per-100 g macros and the serving", () => {
    const p = parseOffProduct("8901058851045", offMaggi)!;
    expect(p.name).toBe("Masala Noodles");
    expect(p.brand).toBe("Maggi");
    expect(p.per100.calories).toBe(427);
    expect(p.servingGrams).toBe(70);
  });

  it("falls back to kJ and rejects products without energy", () => {
    expect(parseOffProduct("1", { product_name: "x", nutriments: { energy_100g: 418.4 } })!.per100.calories).toBeCloseTo(100);
    expect(parseOffProduct("1", { product_name: "x", nutriments: {} })).toBeNull();
  });
});

describe("draftFromProduct", () => {
  const p = parseOffProduct("8901058851045", offMaggi) as BarcodeProduct;

  it("defaults to one labelled serving and says so", () => {
    const d = draftFromProduct(p, { code: p.code }, "lunch");
    expect(d.totals.calories).toBe(299);
    expect(d.items[0]!.name).toBe("Maggi Masala Noodles, 70 g");
    expect(d.servingAssumption).toMatch(/one serving \(70 g\)/);
    expect(d.source).toBe("food_db");
  });

  it("uses grams when given", () => {
    const d = draftFromProduct(p, { code: p.code, grams: 140 }, "dinner");
    expect(d.totals.calories).toBe(598);
    expect(d.servingAssumption).toBeNull();
  });

  it("uses 100 g when the label has no serving", () => {
    const d = draftFromProduct({ ...p, servingGrams: null, servingLabel: null }, { code: p.code }, "snack");
    expect(d.totals.calories).toBe(427);
    expect(d.servingAssumption).toMatch(/100 g/);
  });
});

describe("lookupBarcode", () => {
  it("caches found and missing products, but not outages", async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ status: 1, product: offMaggi })));
    await lookupBarcode("8901058851045", ok);
    await lookupBarcode("8901058851045", ok);
    expect(ok).toHaveBeenCalledTimes(1);

    const missing = vi.fn(async () => new Response(JSON.stringify({ status: 0 }), { status: 404 }));
    expect(await lookupBarcode("00000000", missing)).toBeNull();
    await lookupBarcode("00000000", missing);
    expect(missing).toHaveBeenCalledTimes(1);

    const down = vi.fn(async () => new Response("", { status: 503 }));
    await expect(lookupBarcode("11111111", down)).rejects.toThrow();
    await expect(lookupBarcode("11111111", down)).rejects.toThrow();
    expect(down).toHaveBeenCalledTimes(2);
  });
});

describe("draftMealFromBarcode", () => {
  it("posts a draft card into the chat with the slot from the clock", async () => {
    const record = vi.fn(async () => {});
    const r = await draftMealFromBarcode(ctx, { code: "8901058851045" }, {
      lookup: async (c) => parseOffProduct(c, offMaggi),
      record,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cards[0]!.draft.slot).toBe("lunch"); // 13:00 in Kolkata
    expect(r.text).toMatch(/299 kcal/);
    expect(record).toHaveBeenCalledWith("p1", "▥ Scanned: Masala Noodles", r.text, r.cards);
  });

  it("reports unknown codes and failed lookups without posting", async () => {
    const record = vi.fn(async () => {});
    expect(await draftMealFromBarcode(ctx, { code: "00000000" }, { lookup: async () => null, record })).toEqual({
      ok: false,
      error: "barcode_not_found",
    });
    expect(
      await draftMealFromBarcode(ctx, { code: "00000000" }, { lookup: async () => { throw new Error("x"); }, record }),
    ).toEqual({ ok: false, error: "barcode_lookup_failed" });
    expect(record).not.toHaveBeenCalled();
  });
});
