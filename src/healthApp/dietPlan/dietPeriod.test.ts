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
      single: async () => ({ data: run()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => void) => resolve({ data: op === "select" || wantRows ? run() : (run(), null), error: null }),
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
vi.mock("../onboarding.js", () => ({ loadFoodPrefs: async () => food }));
vi.mock("../snapshot.js", () => ({ loadHealthProfile: async () => ({ targets: { calorieTarget: 2200, proteinTarget: 165 } }) }));
vi.mock("../bodyStore.js", () => ({ getBodyCheckins: async () => [{ weight_kg: 80 }] }));
vi.mock("../frequentMeals.js", () => ({ FREQUENT_WINDOW_DAYS: 30, loadLoggedSessions: async () => [], rankUsualMeals: () => [] }));
vi.mock("./carry.js", () => ({ applyCarries: async () => false }));

import { effectiveDiet } from "./dietPeriod.js";
import { defaultPrefs } from "./prefs.js";
import { loadPlanView, saveDietPrefs, setDietPeriod, loadDietPrefs } from "./store.js";

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
    const { rebuildPlan } = await import("./store.js");
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
