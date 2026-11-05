/**
 * One list of a day's meals, the same on every screen (Today, Meals, chat, digest).
 *
 * Each planned meal is one row, in eating order. Once it's eaten the row shows what was actually
 * logged; until then, the plan. Anything else logged that day is an "extra" row under the meal of
 * its slot. Every number comes from the meal logs, so the list's eaten total is exactly the day's
 * logged total (supplements included: they are logged food like any other).
 *
 * States:
 * - todo:    planned, nothing logged for it yet (today or a later day)
 * - missed:  planned on a past day, nothing logged for it
 * - eaten:   eaten from the plan ("Ate this"); `changed` when portions or items were changed
 * - instead: they logged their own food for this planned meal
 * - extra:   logged food that isn't any planned meal
 *
 * Pure: the loaders pass rows in.
 */
import { PLAN_SLOTS, type PlanSlot } from "./dietPlan/targets.js";

export type Macros4 = { kcal: number; proteinG: number; carbsG: number; fatG: number };
export type DayMealItem = { name: string } & Macros4;

/** A logged meal (one meal session), as history.ts groups meal_logs. */
export type LoggedMeal = {
  mealSessionId: string;
  name: string;
  slot: string;
  text: string;
  loggedAt: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  items: Array<{ name: string; calories: number; proteinG: number; carbsG: number; fatG: number }>;
};

/** A plan entry for the day (meal_plan_entries, source plan). */
export type PlanEntryLite = {
  slot: PlanSlot;
  kind: "option" | "eat_out";
  status: string;
  title: string;
  items: Array<{ text: string } & Partial<Macros4>>;
  totals: Macros4;
  loggedSessionId?: string | null;
  offPlan?: boolean;
};

export type DayMealState = "todo" | "missed" | "eaten" | "instead" | "extra";

export type DayMealRow = {
  /** Stable per day: the slot for a planned meal, the session id for an extra. */
  key: string;
  slot: string;
  state: DayMealState;
  /** What the row shows: eaten food once eaten, planned food before. */
  text: string;
  items: DayMealItem[];
  totals: Macros4;
  /** Portions or items changed from the plan ("Ate this" with edits). */
  changed?: boolean;
  /** "instead": the planned meal it replaced. */
  insteadOf?: string;
  /** Planned meal is "eating out": no known food until they log it. */
  eatOut?: boolean;
  mealSessionId?: string;
  loggedAt?: string;
  /** Planned time of the meal (HH:MM), when the plan has one. */
  time?: string | null;
};

export type DayMeals = {
  date: string;
  rows: DayMealRow[];
  /** Planned meals done (eaten or replaced) of all planned meals. */
  done: number;
  planned: number;
  extras: number;
  /** Everything logged that day. Equals the day's calorie and macro totals everywhere. */
  eaten: Macros4;
  /** Planned meals not eaten yet (todo only). Eat-out meals count their calorie allowance only. */
  toEat: Macros4;
};

const n = (v: unknown): number => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};

export type MealRow = {
  meal_session_id: string | null;
  local_date: string | null;
  meal_slot: string | null;
  raw_text: string | null;
  description: string | null;
  calories: unknown;
  protein_g: unknown;
  carbs_g: unknown;
  fat_g: unknown;
  logged_at: string | null;
  created_at: string | null;
  component_index: number | null;
};

/** Groups meal_logs rows (one per item) into meals per day, newest meal first. */
export function groupMeals(rows: MealRow[]): Map<string, LoggedMeal[]> {
  const sessions = new Map<string, { date: string; rows: MealRow[] }>();
  for (const r of rows) {
    if (!r.meal_session_id || !r.local_date) continue;
    const s = sessions.get(r.meal_session_id) ?? { date: String(r.local_date), rows: [] };
    s.rows.push(r);
    sessions.set(r.meal_session_id, s);
  }
  const out = new Map<string, LoggedMeal[]>();
  for (const [id, s] of sessions) {
    s.rows.sort((a, b) => (a.component_index ?? 0) - (b.component_index ?? 0));
    const first = s.rows[0]!;
    const items = s.rows.map((r) => ({
      name: (r.description ?? "").trim() || (r.raw_text ?? "").trim() || "Item",
      calories: Math.round(n(r.calories)),
      proteinG: r1(n(r.protein_g)),
      carbsG: r1(n(r.carbs_g)),
      fatG: r1(n(r.fat_g)),
    }));
    const meal: LoggedMeal = {
      mealSessionId: id,
      slot: first.meal_slot ?? "unspecified",
      text: (first.raw_text ?? "").trim() || items[0]!.name,
      loggedAt: first.logged_at ?? first.created_at ?? `${s.date}T12:00:00Z`,
      name: "",
      calories: items.reduce((t, i) => t + i.calories, 0),
      proteinG: r1(items.reduce((t, i) => t + i.proteinG, 0)),
      carbsG: r1(items.reduce((t, i) => t + i.carbsG, 0)),
      fatG: r1(items.reduce((t, i) => t + i.fatG, 0)),
      items,
    };
    meal.name = meal.text;
    const list = out.get(s.date) ?? [];
    list.push(meal);
    out.set(s.date, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
  return out;
}

const zero = (): Macros4 => ({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
const r1 = (n: number) => Math.round(n * 10) / 10;
const tidy = (m: Macros4): Macros4 => ({ kcal: Math.round(m.kcal), proteinG: r1(m.proteinG), carbsG: r1(m.carbsG), fatG: r1(m.fatG) });
const add = (a: Macros4, b: Partial<Macros4>): Macros4 => ({ kcal: a.kcal + (b.kcal ?? 0), proteinG: a.proteinG + (b.proteinG ?? 0), carbsG: a.carbsG + (b.carbsG ?? 0), fatG: a.fatG + (b.fatG ?? 0) });

const slotRank = (slot: string) => {
  const i = (PLAN_SLOTS as readonly string[]).indexOf(slot);
  return i < 0 ? PLAN_SLOTS.length : i;
};

const fromLog = (m: LoggedMeal): Pick<DayMealRow, "text" | "items" | "totals" | "mealSessionId" | "loggedAt"> => ({
  text: m.text,
  items: m.items.map((i) => ({ name: i.name, kcal: i.calories, proteinG: i.proteinG, carbsG: i.carbsG, fatG: i.fatG })),
  totals: tidy({ kcal: m.calories, proteinG: m.proteinG, carbsG: m.carbsG, fatG: m.fatG }),
  mealSessionId: m.mealSessionId,
  loggedAt: m.loggedAt,
});

const plannedText = (e: PlanEntryLite) => (e.kind === "eat_out" ? e.title : e.items.map((i) => i.text).join(", ") || e.title);

export function buildDayMeals(input: {
  date: string;
  today: string;
  /** null: no meal plan set up; every log is simply eaten. */
  plan: PlanEntryLite[] | null;
  logs: LoggedMeal[];
  times?: Partial<Record<PlanSlot, string>>;
}): DayMeals {
  const { date, today, logs } = input;
  const plan = [...(input.plan ?? [])].sort((a, b) => slotRank(a.slot) - slotRank(b.slot));
  const bySession = new Map(logs.map((m) => [m.mealSessionId, m]));
  const used = new Set<string>();
  const rows: DayMealRow[] = [];
  let toEat = zero();
  let done = 0;

  for (const e of plan) {
    const time = input.times?.[e.slot] ?? null;
    const eatenNow = e.status === "logged" || e.status === "partial";
    const log = e.loggedSessionId ? bySession.get(e.loggedSessionId) : undefined;
    if (eatenNow && log) {
      used.add(log.mealSessionId);
      done++;
      // Their own food for a meal they'd planned to eat out is just that meal, eaten.
      const instead = e.offPlan === true && e.kind !== "eat_out";
      rows.push({
        key: e.slot,
        slot: e.slot,
        state: instead ? "instead" : "eaten",
        ...fromLog(log),
        ...(instead ? { insteadOf: plannedText(e) } : {}),
        ...(e.status === "partial" ? { changed: true } : {}),
        time,
      });
      continue;
    }
    // Marked eaten but its log is gone (deleted elsewhere): nothing was eaten, so it shows as not eaten.
    const past = date < today;
    const planned = tidy(e.totals);
    if (!past) toEat = add(toEat, e.kind === "eat_out" ? { kcal: planned.kcal } : planned);
    rows.push({
      key: e.slot,
      slot: e.slot,
      state: past ? "missed" : "todo",
      text: plannedText(e),
      items: e.kind === "eat_out" ? [] : e.items.map((i) => ({ name: i.text, kcal: i.kcal ?? 0, proteinG: i.proteinG ?? 0, carbsG: i.carbsG ?? 0, fatG: i.fatG ?? 0 })),
      totals: e.kind === "eat_out" ? { kcal: planned.kcal, proteinG: 0, carbsG: 0, fatG: 0 } : planned,
      ...(e.kind === "eat_out" ? { eatOut: true } : {}),
      time,
    });
  }

  // Every other log: extra with a plan, simply eaten without one. Placed after its slot's planned meal.
  const others = logs.filter((m) => !used.has(m.mealSessionId));
  const hasPlan = input.plan !== null && plan.length > 0;
  for (const m of others) {
    rows.push({ key: m.mealSessionId, slot: m.slot, state: hasPlan ? "extra" : "eaten", ...fromLog(m), time: null });
  }
  const order = (r: DayMealRow) => slotRank(r.slot) * 10 + (r.state === "extra" ? 1 : 0);
  rows.sort((a, b) => order(a) - order(b) || (a.loggedAt ?? "").localeCompare(b.loggedAt ?? ""));

  const eaten = tidy(logs.reduce((a, m) => add(a, { kcal: m.calories, proteinG: m.proteinG, carbsG: m.carbsG, fatG: m.fatG }), zero()));
  return {
    date,
    rows,
    done,
    planned: plan.length,
    extras: hasPlan ? others.length : 0,
    eaten,
    toEat: tidy(toEat),
  };
}

/** A plan entry row from the database as the list needs it. */
export function entryLite(r: { meal_slot: string; status: string; title: string; metadata: Record<string, unknown> | null }): PlanEntryLite | null {
  if (!(PLAN_SLOTS as readonly string[]).includes(r.meal_slot)) return null;
  const m = r.metadata ?? {};
  const items = (Array.isArray(m.items) ? m.items : []) as PlanEntryLite["items"];
  const t = (m.totals ?? {}) as Partial<Macros4>;
  return {
    slot: r.meal_slot as PlanSlot,
    kind: m.kind === "eat_out" ? "eat_out" : "option",
    status: r.status,
    title: r.title,
    items,
    totals: { kcal: Number(t.kcal) || 0, proteinG: Number(t.proteinG) || 0, carbsG: Number(t.carbsG) || 0, fatG: Number(t.fatG) || 0 },
    loggedSessionId: typeof m.logged_session_id === "string" ? m.logged_session_id : null,
    offPlan: m.off_plan === true,
  };
}

/** The day's meals in the app's words: from the plan, had instead, extra, not eaten. */
export function dayMealLines(list: DayMeals): string[] {
  const note: Record<string, string> = { eaten: "from the plan", instead: "had instead of the plan", extra: "extra, on top of the plan", todo: "planned, not eaten", missed: "planned, not eaten" };
  const hasPlan = list.planned > 0;
  return list.rows.map((r) => {
    const what = `${r.slot}: ${r.text.slice(0, 80)} (${Math.round(r.totals.kcal).toLocaleString("en-US")} kcal, ${Math.round(r.totals.proteinG)} g protein)`;
    if (!hasPlan) return what;
    const how = r.state === "instead" && r.insteadOf ? `had instead of planned ${r.insteadOf.slice(0, 60)}` : note[r.state];
    return `${what}, ${how}${r.changed ? ", portions changed" : ""}`;
  });
}
