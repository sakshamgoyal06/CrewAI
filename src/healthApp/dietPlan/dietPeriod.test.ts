import { beforeEach, describe, expect, it, vi } from "vitest";

import { catalog } from "../../meals/catalog/index.js";

type Row = Record<string, any>;
const tables = new Map<string, Row[]>();
let seq = 1;
const T = (n: string) => (tables.get(n) ?? tables.set(n, []).get(n)!);
const get = (r: Row, path: string) => {
  const [col, key] = path.split("->>");
  const v = key ? r[col!]?.[key] : r[col!];
  return v === undefined ? null : v;
};
const cmpStr = (v: unknown) => (v === null ? null : String(v));

vi.mock("../../tools/clients.js", () => {
  const tick = () => new Promise<void>((r) => setImmediate(r));
  const build = (table: string, op: string, payload?: any, upsertKey?: string) => {
    const f: Array<(r: Row) => boolean> = [];
    let lim = Infinity;
    let wantRows = false;
    const run = (): Row[] => {
      const rows = T(table);
      if (op === "insert" || op === "upsert") {
        const list = (Array.isArray(payload) ? payload : [payload]).map((p) => ({ id: `id-${seq++}`, created_at: new Date(2026, 10, 5, 13, 0, seq).toISOString(), ...p }));
        if (op === "upsert") {
          const out: Row[] = [];
          for (const n of list) {
            const hit = rows.find((r) => r[upsertKey!] === n[upsertKey!]);
            if (hit) { Object.assign(hit, { ...n, id: hit.id }); out.push(hit); } else { rows.push(n); out.push(n); }
          }
          return out;
        }
        rows.push(...list);
        return list;
      }
      const hit = rows.filter((r) => f.every((x) => x(r))).slice(0, lim);
      if (op === "update") hit.forEach((r) => Object.assign(r, payload));
      if (op === "delete") tables.set(table, rows.filter((r) => !hit.includes(r)));
      return hit;
    };
    const q: any = {
      eq: (k: string, v: unknown) => (f.push((r) => get(r, k) === v), q),
      neq: (k: string, v: unknown) => (f.push((r) => get(r, k) !== v), q),
      gte: (k: string, v: string) => (f.push((r) => String(get(r, k)) >= v), q),
      lte: (k: string, v: string) => (f.push((r) => String(get(r, k)) <= v), q),
      in: (k: string, v: unknown[]) => (f.push((r) => v.includes(get(r, k))), q),
      is: (k: string, v: unknown) => (f.push((r) => get(r, k) === v), q),
      or: (expr: string) => {
        const parts = expr.split(",").map((p) => {
          const m = /^(.+?)\.(is\.null|neq\.(.+))$/.exec(p)!;
          return (r: Row) => (m[2] === "is.null" ? get(r, m[1]!) === null : cmpStr(get(r, m[1]!)) !== m[3]);
        });
        f.push((r) => parts.some((p) => p(r)));
        return q;
      },
      order: () => q,
      limit: (n: number) => ((lim = n), q),
      select: () => ((wantRows = true), q),
      // Each answer waits a macrotask, like a real network call: the plan builds are long and
      // synchronous, and without a turn of the event loop vitest's worker can't report progress.
      single: () => tick().then(() => ({ data: run()[0] ?? null, error: null })),
      maybeSingle: () => tick().then(() => ({ data: run()[0] ?? null, error: null })),
      then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
        tick().then(() => resolve({ data: op === "select" || wantRows ? run() : (run(), null), error: null }), reject),
    };
    return q;
  };
  return {
    supabase: {
      from: (table: string) => ({
        select: () => build(table, "select"),
        insert: (p: unknown) => build(table, "insert", p),
        update: (p: unknown) => build(table, "update", p),
        delete: () => build(table, "delete"),
        upsert: (p: unknown, o?: { onConflict?: string }) => build(table, "upsert", p, o?.onConflict),
      }),
    },
    anthropic: {},
  };
});

let food = { diet: "custom" as string | null, dietNote: "Only chicken and eggs in non veg" as string | null, foodAvoid: [] as string[] };
vi.mock("../onboarding.js", () => ({
  loadFoodPrefs: async () => food,
  cleanAvoidList: (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))],
  saveFoodAvoid: async (_u: string, xs: string[]) => { food = { ...food, foodAvoid: xs }; },
}));
vi.mock("../snapshot.js", () => ({ loadHealthProfile: async () => ({ targets: { calorieTarget: 2200, proteinTarget: 165 } }) }));
vi.mock("../bodyStore.js", () => ({ getBodyCheckins: async () => [{ weight_kg: 80 }] }));
vi.mock("../frequentMeals.js", () => ({ FREQUENT_WINDOW_DAYS: 30, loadLoggedSessions: async () => [], rankUsualMeals: () => [] }));
vi.mock("./carry.js", () => ({ applyCarries: async () => false }));

import { composeOptions, fastingSafe } from "./compose.js";
import { effectiveDiet } from "./dietPeriod.js";
import { defaultPrefs } from "./prefs.js";
import { parseFoodRules } from "./rules.js";
import { changeAvoidList, loadPlanView, rebuildPlan, saveDietPrefs, setDietPeriod, loadDietPrefs } from "./store.js";
import { DEFAULT_SHARES, macroTargets, mealBudgets } from "./targets.js";

const U = "user-1";
const ctx = { userProfileId: U, timezone: "Asia/Kolkata" };
const NOW = new Date("2026-11-05T13:15:00Z"); // 18:45 on 2026-11-05 in India
const cat = catalog();
const nonVegKeys = (items: Array<{ key: string | null }>) => items.filter((i) => i.key && ["nonveg", "egg"].includes(cat.byKey.get(i.key)?.diet ?? "")).map((i) => i.key);
const entry = (date: string, slot: string, m: Row = {}) => T("meal_plan_entries").find((r) => r.local_date === date && r.meal_slot === slot && r.status === "planned") as Row | undefined;

beforeEach(async () => {
  tables.clear();
  seq = 1;
  food = { diet: "custom", dietNote: "Only chicken and eggs in non veg", foodAvoid: [] };
  await saveDietPrefs(U, defaultPrefs());
});

describe("effectiveDiet", () => {
  const ov = { diet: "vegetarian" as const, from: "2026-11-05", until: "2026-11-24" };
  it("narrows their diet only while the period runs", () => {
    expect(effectiveDiet("custom", ov, "2026-11-24")).toBe("vegetarian");
    expect(effectiveDiet("custom", ov, "2026-11-25")).toBe("custom");
    expect(effectiveDiet("non_vegetarian", ov, "2026-11-10")).toBe("vegetarian");
  });
  it("never widens a stricter diet", () => {
    expect(effectiveDiet("vegan", ov, "2026-11-10")).toBe("vegan");
    expect(effectiveDiet("jain", { ...ov, diet: "eggetarian" }, "2026-11-10")).toBe("jain");
  });
});

describe("a temporary veg-only diet", { timeout: 60_000 }, () => {
  it("re-plans meals that break it, keeps edits that fit, and tells what is there now", async () => {
    // The plan as it was: chicken and egg meals picked for the next days.
    let view = await loadPlanView(ctx, NOW);
    expect(view.ok).toBe(true);
    const days = (view as any).days as Array<{ date: string; slot: string; items: Array<{ key: string | null }> }>;
    expect(days.some((d) => nonVegKeys(d.items).length)).toBe(true);

    // A breakfast they edited by hand that is veg, and a lunch edited that has chicken.
    const veg = cat.byKey.get("poha")!;
    expect(veg.diet).toMatch(/veg/);
    const vegItem = { key: "poha", name: "Poha", servingId: null, qty: 1, text: "Poha", grams: 200, kcal: 300, proteinG: 8, carbsG: 50, fatG: 6, fiberG: 3 };
    const b = entry("2026-11-06", "breakfast")!;
    Object.assign(b, { title: "Poha", metadata: { ...b.metadata, items: [vegItem], totals: { kcal: 300, proteinG: 8, carbsG: 50, fatG: 6, fiberG: 3 }, edited: true } });
    const chickenKey = [...cat.byKey.values()].find((e) => e.diet === "nonveg" && /chicken/.test(e.key))!.key;
    const l = entry("2026-11-06", "lunch")!;
    Object.assign(l, { title: "Chicken", metadata: { ...l.metadata, items: [{ ...vegItem, key: chickenKey, name: "Chicken", text: "Chicken" }], edited: true } });

    const r = await setDietPeriod(ctx, { diet: "vegetarian", until: "2026-11-24" }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.until).toBe("2026-11-24");
    expect(r.violations).toBe(0);
    expect(r.replaced.some((x) => x.date === "2026-11-06" && x.slot === "lunch" && x.edited)).toBe(true);
    expect(r.keptEdits).toContainEqual({ date: "2026-11-06", slot: "breakfast" });
    // Their breakfast is still theirs; no planned meal holds chicken or egg anywhere.
    expect(entry("2026-11-06", "breakfast")!.title).toBe("Poha");
    view = await loadPlanView(ctx, NOW);
    for (const d of (view as any).days) if (d.status === "planned") expect(nonVegKeys(d.items)).toEqual([]);
    for (const m of r.meals) if (m.status === "planned") expect(m.meal).not.toMatch(/chicken|egg|omelette/i);
    expect((await loadDietPrefs(U)).prefs.dietOverride?.until).toBe("2026-11-24");
  });

  it("keeps hand edits through any rebuild, but a fresh plan on request replaces them", async () => {
    await loadPlanView(ctx, NOW);
    const b = entry("2026-11-06", "breakfast")!;
    Object.assign(b, { title: "My breakfast", metadata: { ...b.metadata, edited: true } });
    await rebuildPlan(ctx, "chat", NOW);
    expect(entry("2026-11-06", "breakfast")?.title).toBe("My breakfast");
    await rebuildPlan(ctx, "rebuild", NOW);
    expect(entry("2026-11-06", "breakfast")).toBeUndefined();
  });

  it("survives saving the setup screen's answers", async () => {
    await setDietPeriod(ctx, { diet: "vegetarian", until: "2026-11-24" }, NOW);
    const { dietOverride: _o, habits: _h, unavailable: _u, ...fromScreen } = defaultPrefs() as Record<string, unknown>;
    await saveDietPrefs(U, fromScreen as any);
    expect((await loadDietPrefs(U)).prefs.dietOverride?.diet).toBe("vegetarian");
  });

  it("goes back to their own diet after the last day", async () => {
    await setDietPeriod(ctx, { diet: "vegetarian", until: "2026-11-24" }, NOW);
    const later = new Date("2026-11-25T06:00:00Z");
    const view = await loadPlanView(ctx, later);
    expect(view.ok).toBe(true);
    expect((await loadDietPrefs(U)).prefs.dietOverride).toBeNull();
  });

  it("ends early when asked, and refuses a period with no end", async () => {
    await setDietPeriod(ctx, { diet: "vegetarian", until: "2026-11-24" }, NOW);
    const r = await setDietPeriod(ctx, { diet: null }, NOW);
    expect(r.ok && r.diet).toBeNull();
    expect((await loadDietPrefs(U)).prefs.dietOverride).toBeNull();
    expect(await setDietPeriod(ctx, { diet: "vegetarian" }, NOW)).toEqual({ ok: false, error: "bad_dates" });
  });
});

const planned = (view: any, date: string) => ((view.days ?? []) as any[]).filter((d) => d.date === date && d.status === "planned");
const hasKey = (d: any, re: RegExp) => d.items.some((i: any) => re.test(i.key ?? i.name ?? ""));

describe("food rules in their own words", () => {
  it("reads foods, weekdays and no-meat days, and leaves lines without a food to the coach", () => {
    const r = parseFoodRules(["No onion-garlic on Tuesdays", "allergic to peanuts", "diabetic", "No non veg on Thursdays and Saturdays", "Only chicken and eggs in non veg. Rest only vegetarian"]);
    expect(r.avoid).toEqual(["peanuts"]);
    expect(r.days[2]?.avoid).toEqual(["onion", "garlic"]);
    expect(r.days[4]?.nonVeg).toBe(true);
    expect(r.days[6]?.nonVeg).toBe(true);
    // Weekday lines don't reach the every-day meat policy.
    expect(r.everyDayText.some((t) => /thursday/.test(t))).toBe(false);
    expect(r.everyDayText).toContain("only chicken and eggs in nonveg");
  });

  it("knows fasting food", () => {
    expect(fastingSafe(cat.byKey.get("sabudana khichdi")!)).toBe(true);
    expect(fastingSafe(cat.byKey.get("poha")!)).toBe(false);
    expect(fastingSafe(cat.byKey.get("kuttu puri")!)).toBe(true);
  });

  it("keeps a usual meal with chicken out of a vegetarian plan", () => {
    const b = mealBudgets(macroTargets({ calories: 2200, proteinG: 165, weightKg: 80 }), DEFAULT_SHARES).find((x) => x.slot === "lunch")!;
    const usual = [{ key: "u1", text: "Chicken burrito bowl", items: [{ name: "Chicken burrito bowl", calories: 700, protein_g: 45, carbs_g: 70, fat_g: 20 }] }];
    expect(composeOptions({ budget: b, diet: "non_vegetarian", avoid: [], loves: [], staples: "both", prepLimit: null, usual }).some((o) => o.origin === "usual")).toBe(true);
    expect(composeOptions({ budget: b, diet: "vegetarian", avoid: [], loves: [], staples: "both", prepLimit: null, usual }).some((o) => o.origin === "usual")).toBe(false);
  });
});

describe("every rule reaches the plan", { timeout: 60_000 }, () => {
  it("plans a fasting day with fasting food only, and normal food the next day", async () => {
    // 2026-11-06 is a Friday.
    await saveDietPrefs(U, { ...defaultPrefs(), fastingDays: [5] });
    await rebuildPlan(ctx, "prefs_changed", NOW);
    const view = await loadPlanView(ctx, NOW);
    const fri = planned(view, "2026-11-06");
    expect(fri.length).toBeGreaterThan(0);
    for (const d of fri) {
      if (d.kind === "eat_out") expect(d.title).toMatch(/^Fasting meal/);
      else for (const i of d.items) if (i.key) expect(fastingSafe(cat.byKey.get(i.key)!)).toBe(true);
    }
    expect(fri.some((d) => d.kind === "option")).toBe(true);
    const sat = planned(view, "2026-11-07");
    expect(sat.some((d) => d.items.some((i: any) => i.key && !fastingSafe(cat.byKey.get(i.key)!)))).toBe(true);
  });

  it("keeps a weekday rule on that day only", async () => {
    // Saturday 2026-11-07: no non-veg. Friday may still have chicken or egg.
    await saveDietPrefs(U, { ...defaultPrefs(), restrictions: ["No non veg on Saturdays"] });
    await rebuildPlan(ctx, "prefs_changed", NOW);
    const view = await loadPlanView(ctx, NOW);
    const sat = planned(view, "2026-11-07");
    expect(sat.length).toBeGreaterThan(0);
    for (const d of sat) expect(nonVegKeys(d.items)).toEqual([]);
  });

  it("a free-text 'no paneer' in setup keeps paneer out", async () => {
    await saveDietPrefs(U, { ...defaultPrefs(), loves: ["Paneer"], restrictions: ["no paneer please"] });
    await rebuildPlan(ctx, "prefs_changed", NOW);
    const view = await loadPlanView(ctx, NOW);
    for (const d of (view as any).days) if (d.status === "planned") expect(hasKey(d, /paneer/)).toBe(false);
  });

  it("the coach can add a lasting food to avoid, and the plan drops it at once", async () => {
    await saveDietPrefs(U, { ...defaultPrefs(), loves: ["Paneer"] });
    await loadPlanView(ctx, NOW);
    const r = await changeAvoidList(ctx, { add: ["paneer"] }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.avoid).toContain("paneer");
    expect(r.violations).toBe(0);
    for (const m of r.meals) if (m.status === "planned") expect(m.meal).not.toMatch(/paneer/i);
    expect(await changeAvoidList(ctx, { add: ["paneer"] }, NOW)).toEqual({ ok: false, error: "nothing_to_change" });
  });

  it("a temporary no-sweets week works without a diet change", async () => {
    await loadPlanView(ctx, NOW);
    const r = await setDietPeriod(ctx, { diet: null, avoid: ["milk"], until: "2026-11-11" }, NOW);
    expect(r.ok && r.avoid).toEqual(["milk"]);
    if (!r.ok) return;
    expect(r.violations).toBe(0);
    const view = await loadPlanView(ctx, NOW);
    for (const d of (view as any).days) if (d.status === "planned") expect(hasKey(d, /\bmilk\b/)).toBe(false);
  });

  it("'Make me a fresh plan' still keeps the temporary diet", async () => {
    await setDietPeriod(ctx, { diet: "vegetarian", until: "2026-11-24" }, NOW);
    await rebuildPlan(ctx, "rebuild", NOW);
    const view = await loadPlanView(ctx, NOW);
    for (const d of (view as any).days) if (d.status === "planned") expect(nonVegKeys(d.items)).toEqual([]);
  });

  it("changing food settings keeps hand edits that still fit", async () => {
    await loadPlanView(ctx, NOW);
    const b = entry("2026-11-06", "breakfast")!;
    const veg = { key: "poha", name: "Poha", servingId: null, qty: 1, text: "Poha", grams: 200, kcal: 300, proteinG: 8, carbsG: 50, fatG: 6, fiberG: 3 };
    Object.assign(b, { title: "Poha", metadata: { ...b.metadata, items: [veg], edited: true } });
    await changeAvoidList(ctx, { add: ["mushroom"] }, NOW);
    expect(entry("2026-11-06", "breakfast")?.title).toBe("Poha");
  });
});
