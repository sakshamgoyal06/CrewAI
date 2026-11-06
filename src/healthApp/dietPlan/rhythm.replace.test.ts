import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("../meals.js", async (orig) => ({
  ...(await orig<typeof import("../meals.js")>()),
  deleteMeal: async (_u: string, sessionId: string) => {
    for (const r of T("meal_logs")) if (r.meal_session_id === sessionId) r.deleted_at = "now";
    return { ok: true, localDate: "2026-11-05" };
  },
}));

import { afterMealLogged, previewPlanRole, setMealPlanRole } from "./rhythm.js";

const ctx = { userProfileId: "u1", timezone: "Asia/Kolkata", now: new Date("2026-11-07T10:00:00Z") } as never;
const later = new Date("2026-11-07T10:00:00Z");

// 5 Nov: the planned chicken fry dinner was ticked as eaten at 6 pm, then a Whopper was logged
// for dinner; both counted (3,248 kcal) and nothing asked.
describe("a meal logged for a slot already ticked as eaten", () => {
  beforeEach(() => {
    tables.clear();
    T("meal_plan_entries").push({ id: "e1", user_profile_id: "u1", local_date: "2026-11-05", meal_slot: "dinner", source: "plan", status: "logged", title: "Chicken fry", metadata: { items: [{ text: "chicken fry" }, { text: "rice" }], logged_session_id: "s-plan" } });
    T("meal_logs").push(
      { meal_session_id: "s-plan", user_profile_id: "u1", local_date: "2026-11-05", meal_slot: "dinner", description: "chicken fry", calories: 855, deleted_at: null, component_index: 0 },
      { meal_session_id: "s-burger", user_profile_id: "u1", local_date: "2026-11-05", meal_slot: "dinner", description: "Veg Whopper", calories: 450, deleted_at: null, component_index: 0 },
    );
  });

  it("says the planned meal is already marked eaten", async () => {
    const role = await afterMealLogged(ctx, { date: "2026-11-05", slot: "dinner", mealSessionId: "s-burger" }, later);
    expect(role).toEqual({ role: "extra", slot: "dinner", alreadyEaten: "chicken fry, rice" });
  });

  it("\"I didn't eat that\" takes the planned meal off and puts this one in its place", async () => {
    const r = await setMealPlanRole(ctx, "s-burger", "replace", later);
    expect(r).toMatchObject({ ok: true, result: { role: "instead", slot: "dinner" } });
    expect(T("meal_logs").find((l) => l.meal_session_id === "s-plan")!.deleted_at).not.toBeNull();
    expect(T("meal_logs").find((l) => l.meal_session_id === "s-burger")!.deleted_at).toBeNull();
    expect(T("meal_plan_entries")[0]).toMatchObject({ status: "logged", metadata: { logged_session_id: "s-burger", off_plan: true } });
  });

  it("asks nothing when the slot's meal was replaced by another log, not ticked", async () => {
    T("meal_plan_entries")[0]!.metadata.off_plan = true;
    expect(await afterMealLogged(ctx, { date: "2026-11-05", slot: "dinner", mealSessionId: "s-burger" }, later)).toEqual({ role: "extra" });
    expect(await setMealPlanRole(ctx, "s-burger", "replace", later)).toEqual({ ok: false, error: "nothing_to_replace" });
  });
});

// 6 Nov: "Add a tea in today's breakfast" must sit on top of breakfast, even while it's still planned.
describe("an add-on logged for a still-planned meal", () => {
  beforeEach(() => {
    tables.clear();
    T("meal_plan_entries").push({ id: "e2", user_profile_id: "u1", local_date: "2026-11-05", meal_slot: "breakfast", source: "plan", status: "planned", title: "Poha", metadata: { items: [{ text: "1 plate poha" }] } });
    T("meal_logs").push({ meal_session_id: "s-tea", user_profile_id: "u1", local_date: "2026-11-05", meal_slot: "breakfast", description: "Chai", calories: 77, deleted_at: null, component_index: 0 });
  });

  it("stays extra and leaves the planned breakfast to eat", async () => {
    const role = await afterMealLogged(ctx, { date: "2026-11-05", slot: "breakfast", mealSessionId: "s-tea", extra: true }, later);
    expect(role).toEqual({ role: "extra", slot: "breakfast" });
    expect(T("meal_plan_entries")[0]).toMatchObject({ status: "planned" });
    expect(T("meal_plan_entries")[0]!.metadata.logged_session_id).toBeUndefined();
  });

  it("without the add-on flag it still takes the planned meal's place", async () => {
    const role = await afterMealLogged(ctx, { date: "2026-11-05", slot: "breakfast", mealSessionId: "s-tea" }, later);
    expect(role).toEqual({ role: "instead", slot: "breakfast", insteadOf: "1 plate poha" });
  });

  it("previews where the draft will go, without changing the plan", async () => {
    expect(await previewPlanRole("u1", "2026-11-05", "breakfast")).toEqual({ role: "instead", slot: "breakfast", insteadOf: "1 plate poha" });
    expect(await previewPlanRole("u1", "2026-11-05", "breakfast", { extra: true })).toEqual({ role: "extra", slot: "breakfast" });
    expect(T("meal_plan_entries")[0]).toMatchObject({ status: "planned" });
  });
});
