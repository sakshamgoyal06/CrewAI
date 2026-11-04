import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  existing: [] as Array<{ local_date: string; meal_session_id: string; raw_text: string | null }>,
  inserted: [] as Array<Record<string, unknown>>,
}));

vi.mock("../tools/clients.js", () => {
  const from = () => {
    const chain: Record<string, unknown> = {};
    for (const k of ["select", "eq", "is", "gte", "lte"]) chain[k] = () => chain;
    chain.limit = async () => ({ data: db.existing, error: null });
    chain.insert = async (rows: Array<Record<string, unknown>>) => {
      db.inserted.push(...rows);
      return { error: null };
    };
    return chain;
  };
  return { supabase: { from }, anthropic: {} };
});

import { importMfp, mfpDate, mfpSessionId, MFP_RAW_TEXT, parseCsv, parseMfpNutritionSummary } from "./mfpImport.js";

const CSV = [
  "Date,Meal,Calories,Fat (g),Saturated Fat,Polyunsaturated Fat,Monounsaturated Fat,Trans Fat,Cholesterol,Sodium (mg),Potassium,Carbohydrates (g),Fiber,Sugar,Protein (g),Note",
  "2026-10-30,Breakfast,420.5,12,3,1,2,0,180,400,300,50,4,8,22,",
  "2026-10-30,Lunch,650,20,6,2,5,0,90,900,500,70,6,5,35,\"rice, dal\"",
  "2026-10-30,Lunch,100,1,0,0,0,0,0,10,50,20,1,10,2,",
  "2026-10-31,Dinner,700,25,8,3,6,0,100,1000,600,60,5,4,45,",
  "2026-10-31,Snacks,0,0,0,0,0,0,0,0,0,0,0,0,0,",
  "2026-11-01,Snacks,200,8,2,1,2,0,10,100,100,25,2,15,6,",
  "2024-01-01,Lunch,500,10,0,0,0,0,0,0,0,50,0,0,30,",
].join("\r\n");

const RANGE = { from: "2025-11-04", to: "2026-11-04" };
const NOW = new Date("2026-11-04T06:00:00Z");

describe("MyFitnessPal CSV", () => {
  it("parses quoted fields and CRLF", () => {
    expect(parseCsv('a,"b, c","d ""e"""\r\n1,2,3\n')).toEqual([["a", "b, c", 'd "e"'], ["1", "2", "3"]]);
  });

  it("reads ISO and US dates and rejects bad ones", () => {
    expect(mfpDate("2026-10-31")).toBe("2026-10-31");
    expect(mfpDate("10/31/2026")).toBe("2026-10-31");
    expect(mfpDate("2026-02-30")).toBeNull();
    expect(mfpDate("yesterday")).toBeNull();
  });

  it("adds up rows per day and meal, skipping empty and out-of-range rows", () => {
    const r = parseMfpNutritionSummary(CSV, RANGE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.meals).toEqual([
      { date: "2026-10-30", slot: "breakfast", label: "Breakfast", calories: 421, protein_g: 22, carbs_g: 50, fat_g: 12 },
      { date: "2026-10-30", slot: "lunch", label: "Lunch", calories: 750, protein_g: 37, carbs_g: 90, fat_g: 21 },
      { date: "2026-10-31", slot: "dinner", label: "Dinner", calories: 700, protein_g: 45, carbs_g: 60, fat_g: 25 },
      { date: "2026-11-01", slot: "snack", label: "Snacks", calories: 200, protein_g: 6, carbs_g: 25, fat_g: 8 },
    ]);
  });

  it("refuses a file that isn't a nutrition summary", () => {
    expect(parseMfpNutritionSummary("Date,Exercise,Calories\n2026-10-30,Run,300", RANGE)).toEqual({ ok: false, error: "not_mfp_summary" });
  });

  it("gives each meal a stable UUID", () => {
    const a = mfpSessionId("u1", "2026-10-30", "Lunch");
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(mfpSessionId("u1", "2026-10-30", "lunch")).toBe(a);
    expect(mfpSessionId("u2", "2026-10-30", "Lunch")).not.toBe(a);
  });
});

describe("importMfp", () => {
  beforeEach(() => {
    db.existing = [];
    db.inserted = [];
  });

  it("previews without writing", async () => {
    const r = await importMfp("u1", { csv: CSV, dryRun: true }, "Asia/Kolkata", NOW);
    expect(r).toMatchObject({ ok: true, dryRun: true, days: 3, meals: 4, from: "2026-10-30", to: "2026-11-01", skippedLoggedDays: 0 });
    expect(db.inserted).toHaveLength(0);
  });

  it("imports, skipping days already logged in Magnus and meals imported before", async () => {
    db.existing = [
      { local_date: "2026-10-31", meal_session_id: "abc", raw_text: "dal chawal" },
      { local_date: "2026-11-01", meal_session_id: mfpSessionId("u1", "2026-11-01", "Snacks"), raw_text: MFP_RAW_TEXT },
    ];
    const r = await importMfp("u1", { csv: CSV }, "Asia/Kolkata", NOW);
    expect(r).toMatchObject({ ok: true, days: 1, meals: 2, skippedLoggedDays: 1, alreadyImported: 1, avgCalories: 1171 });
    expect(db.inserted.map((x) => [x.local_date, x.meal_slot, x.calories, x.raw_text])).toEqual([
      ["2026-10-30", "breakfast", 421, MFP_RAW_TEXT],
      ["2026-10-30", "lunch", 750, MFP_RAW_TEXT],
    ]);
    expect(db.inserted[1]!.meal_session_id).toBe(mfpSessionId("u1", "2026-10-30", "Lunch"));
  });

  it("says when nothing in the file is usable", async () => {
    const r = await importMfp("u1", { csv: "Date,Meal,Calories\n2020-01-01,Lunch,500" }, "UTC", NOW);
    expect(r).toEqual({ ok: false, error: "no_meals" });
  });
});
