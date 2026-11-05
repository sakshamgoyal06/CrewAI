/**
 * The plan through the day, from stored data only (no model call):
 * - the morning card lists today's meals;
 * - at each meal's time, a card in chat (and a push) with the planned meal and "Ate this";
 * - after an off-plan meal, the rest of today's planned meals are resized to land the day;
 * - at night, the day close: how the day went, any carry-over, and tomorrow's meals.
 */
import { logger } from "../../logger.js";
import { localDateKey } from "../../nutrition/localDate.js";
import { supabase } from "../../tools/clients.js";
import { loggableError } from "../../util/loggableError.js";
import { stableTurnId } from "../../util/stableId.js";
import { addDays, localClock } from "../../util/time.js";
import type { ActionContext } from "../actions.js";
import { getPrefs, isQuiet, sendNotification } from "../push.js";
import { closeDay, rebalanceDay } from "./adjust.js";
import { saveCarry } from "./carry.js";
import { sumTotals, type MealOption, type PlanItem, type Totals } from "./compose.js";
import { loadPlanView, type PlannedMeal, type PlanView } from "./store.js";
import { PLAN_SLOTS, type PlanSlot } from "./targets.js";

export const SLOT_LABEL: Record<PlanSlot, string> = { breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner" };
/** The meal card posts from this long before the meal's time until this long after it. */
export const MEAL_CARD_BEFORE_MIN = 10;
export const MEAL_CARD_AFTER_MIN = 60;
/** The day closes from this local time, and at least an hour after the last planned meal. */
export const DAY_CLOSE_FROM = "21:45";
/** Fewer meals logged than this and the day close doesn't move tomorrow (it can't tell a miss from a gap). */
export const DAY_CLOSE_MIN_MEALS = 2;
/** Never plan a day below this, whatever the carry-over (the calorie review's floor). */
export const FLOOR_KCAL = 1200;

export type PlanMealCard = {
  type: "plan_meal";
  date: string;
  slot: PlanSlot;
  time: string | null;
  title: string;
  items: string[];
  kcal: number;
  proteinG: number;
  /** Live: planned, logged or partial. */
  status?: string;
  /** Live: the meal log an eaten meal wrote, so the card can open it for editing. */
  loggedSessionId?: string;
};

export type PlanAdjustCard = {
  type: "plan_adjust";
  kind: "rebalance" | "day_close";
  date: string;
  headline: string;
  lines: string[];
  /** Day close only: tomorrow's planned meals. */
  next?: { date: string; meals: DayMealLine[] };
};

export type DayMealLine = { slot: PlanSlot; time: string | null; title: string; kcal: number; status: string };

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const at = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
};

export function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

const timeOf = (view: PlanView, slot: PlanSlot) => view.prefs.meals.find((m) => m.slot === slot)?.time ?? null;
const order = (a: { slot: PlanSlot }, b: { slot: PlanSlot }) => PLAN_SLOTS.indexOf(a.slot) - PLAN_SLOTS.indexOf(b.slot);

/** One day's planned meals, in day order. Pure. */
export function mealsOn(view: PlanView, date: string): Array<PlannedMeal & { time: string | null }> {
  return view.days
    .filter((d) => d.date === date)
    .map((d) => ({ ...d, time: timeOf(view, d.slot) }))
    .sort(order);
}

export function mealLines(view: PlanView, date: string): DayMealLine[] {
  return mealsOn(view, date).map((m) => ({ slot: m.slot, time: m.time, title: m.title, kcal: m.totals.kcal, status: m.status }));
}

/** The plan, or null when they haven't set meals up (or it can't be built right now). */
export async function planViewOrNull(ctx: ActionContext, now: Date): Promise<PlanView | null> {
  try {
    const v = await loadPlanView(ctx, now);
    return v.ok && v.setup && v.plan ? v : null;
  } catch (err) {
    logger.warn({ err: loggableError(err) }, "diet plan load failed");
    return null;
  }
}

// ---------- meal time ----------

/** Planned meals whose card is due at `minutes` past local midnight. Pure. */
export function dueMeals<T extends { status: string; kind: string; time: string | null; items: PlanItem[] }>(meals: T[], minutes: number): T[] {
  return meals.filter(
    (m) => m.status === "planned" && m.kind === "option" && m.items.length && m.time && minutes >= at(m.time) - MEAL_CARD_BEFORE_MIN && minutes < at(m.time) + MEAL_CARD_AFTER_MIN,
  );
}

export function planMealCard(m: PlannedMeal & { time: string | null }): { text: string; card: PlanMealCard } {
  const card: PlanMealCard = {
    type: "plan_meal",
    date: m.date,
    slot: m.slot,
    time: m.time,
    title: m.title,
    items: m.items.map((i) => i.text),
    kcal: m.totals.kcal,
    proteinG: Math.round(m.totals.proteinG),
  };
  const text = `${SLOT_LABEL[m.slot]} on your plan: ${card.items.join(", ")} (${fmt(card.kcal)} kcal, ${card.proteinG} g protein).`;
  return { text, card };
}

/** Inserts a coach message once per turn id. True when this call posted it. */
async function postOnce(userProfileId: string, turnId: string, content: string, cards: unknown[]): Promise<boolean> {
  const { error } = await supabase.from("health_chat_messages").insert({ user_profile_id: userProfileId, role: "assistant", content, cards, turn_id: turnId, status: "ok" });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error(error.message);
}

async function exists(userProfileId: string, turnId: string): Promise<boolean> {
  const { data, error } = await supabase.from("health_chat_messages").select("id").eq("user_profile_id", userProfileId).eq("turn_id", turnId).limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

export async function runMealTimeTick(ctx: ActionContext, now = new Date()): Promise<number> {
  const date = localDateKey(now, ctx.timezone);
  const { minutes, hhmm } = localClock(now, ctx.timezone);
  // Cheap check first: no plan set up, nothing to do (one small query, not the whole plan).
  const { data: prefsRow } = await supabase.from("health_diet_preferences").select("user_profile_id").eq("user_profile_id", ctx.userProfileId).maybeSingle();
  if (!prefsRow) return 0;
  const view = await planViewOrNull(ctx, now);
  if (!view) return 0;
  let posted = 0;
  for (const m of dueMeals(mealsOn(view, date), minutes)) {
    const turnId = stableTurnId(`magnus-plan-meal:${ctx.userProfileId}:${date}:${m.slot}`);
    if (await exists(ctx.userProfileId, turnId)) continue;
    const { text, card } = planMealCard(m);
    if (!(await postOnce(ctx.userProfileId, turnId, text, [card]))) continue;
    posted += 1;
    const prefs = await getPrefs(ctx.userProfileId);
    if (!prefs.off.includes("plan_meal") && !isQuiet(hhmm, prefs)) {
      await sendNotification(ctx.userProfileId, {
        kind: "plan_meal",
        dedupeKey: `plan_meal:${m.slot}:${date}`,
        title: `${SLOT_LABEL[m.slot]}: ${m.title}`,
        body: `${fmt(card.kcal)} kcal, ${card.proteinG} g protein. Tap Ate this when you've eaten, or change the portions.`,
        url: "/app/#meals",
      });
    }
  }
  return posted;
}

// ---------- off-plan meals ----------

type LogRow = { meal_slot: string | null; calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; meal_session_id: string | null };

async function eatenOn(userProfileId: string, date: string): Promise<{ totals: Totals; slots: Set<string> }> {
  const { data, error } = await supabase
    .from("meal_logs")
    .select("meal_slot, calories, protein_g, carbs_g, fat_g, meal_session_id")
    .eq("user_profile_id", userProfileId)
    .eq("local_date", date)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as LogRow[];
  const totals = sumTotals(rows.map((r) => ({ kcal: Number(r.calories) || 0, proteinG: Number(r.protein_g) || 0, carbsG: Number(r.carbs_g) || 0, fatG: Number(r.fat_g) || 0, fiberG: 0 })));
  return { totals, slots: new Set(rows.map((r) => r.meal_slot ?? "").filter(Boolean)) };
}

/** Rebalance text: what changed in each meal still to come. Pure. */
export function rebalanceCard(date: string, eatenKcal: number, targetKcal: number, changes: Array<{ slot: PlanSlot; changes: string[]; kcal: number }>): { text: string; card: PlanAdjustCard } {
  const over = eatenKcal > targetKcal;
  const headline = `${fmt(eatenKcal)} of ${fmt(targetKcal)} kcal so far. I ${over ? "trimmed" : "adjusted"} the rest of today so the day still lands.`;
  const lines = changes.map((c) => `${SLOT_LABEL[c.slot]}: ${c.changes.join(", ")} (${fmt(c.kcal)} kcal)`);
  return { text: [headline, ...lines].join("\n"), card: { type: "plan_adjust", kind: "rebalance", date, headline, lines } };
}

/**
 * A meal was logged outside "Ate this" (chat, photo, the meal sheet). If its meal was planned, the
 * plan entry is marked eaten (off plan); then, for today, the meals still to come are resized.
 */
export async function afterMealLogged(ctx: ActionContext, input: { date: string; slot: string; mealSessionId: string }, now = new Date()): Promise<void> {
  const slot = (PLAN_SLOTS as readonly string[]).includes(input.slot) ? (input.slot as PlanSlot) : null;
  if (slot) {
    const { data } = await supabase
      .from("meal_plan_entries")
      .select("id, metadata")
      .eq("user_profile_id", ctx.userProfileId)
      .eq("local_date", input.date)
      .eq("meal_slot", slot)
      .eq("source", "plan")
      .eq("status", "planned")
      .limit(1);
    const entry = (data ?? [])[0] as { id: string; metadata: Record<string, unknown> | null } | undefined;
    if (entry) {
      await supabase
        .from("meal_plan_entries")
        .update({ status: "logged", metadata: { ...(entry.metadata ?? {}), off_plan: true, logged_session_id: input.mealSessionId }, updated_at: new Date().toISOString() })
        .eq("id", entry.id);
      await supabase.from("meal_logs").update({ plan_entry_id: entry.id }).eq("user_profile_id", ctx.userProfileId).eq("meal_session_id", input.mealSessionId);
    }
  }
  if (input.date !== localDateKey(now, ctx.timezone)) return;
  await rebalanceToday(ctx, now);
}

/** Resizes today's meals still to come against what's eaten so far; posts a card when anything moved. */
export async function rebalanceToday(ctx: ActionContext, now = new Date()): Promise<boolean> {
  const date = localDateKey(now, ctx.timezone);
  const view = await planViewOrNull(ctx, now);
  if (!view?.plan) return false;
  const remaining: MealOption[] = mealsOn(view, date)
    .filter((m) => m.status === "planned" && m.kind === "option" && m.items.length)
    .map((m) => ({ id: m.optionId ?? m.slot, slot: m.slot, title: m.title, items: m.items, totals: m.totals, origin: "catalog", prepMinutes: 0 }));
  if (!remaining.length) return false;
  const { totals: eaten } = await eatenOn(ctx.userProfileId, date);
  const moved = rebalanceDay({ target: view.plan.targets, budgets: view.plan.budgets, eaten, remaining });
  if (!moved.length) return false;
  for (const r of moved) {
    const { data } = await supabase
      .from("meal_plan_entries")
      .select("id, metadata")
      .eq("user_profile_id", ctx.userProfileId)
      .eq("local_date", date)
      .eq("meal_slot", r.slot)
      .eq("source", "plan")
      .eq("status", "planned")
      .limit(1);
    const entry = (data ?? [])[0] as { id: string; metadata: Record<string, unknown> | null } | undefined;
    if (!entry) continue;
    const { error } = await supabase
      .from("meal_plan_entries")
      .update({
        metadata: { ...(entry.metadata ?? {}), items: r.items, totals: r.totals, rebalanced: true },
        estimated_calories: r.totals.kcal,
        estimated_protein_g: r.totals.proteinG,
        estimated_carbs_g: r.totals.carbsG,
        estimated_fat_g: r.totals.fatG,
        updated_at: new Date().toISOString(),
      })
      .eq("id", entry.id)
      .eq("status", "planned");
    if (error) throw new Error(error.message);
  }
  const { text, card } = rebalanceCard(date, eaten.kcal, view.plan.targets.calories, moved.map((r) => ({ slot: r.slot, changes: r.changes, kcal: r.totals.kcal })));
  await postOnce(ctx.userProfileId, stableTurnId(`magnus-plan-rebalance:${ctx.userProfileId}:${date}:${now.getTime()}`), text, [card]);
  return true;
}

// ---------- day close ----------

export function dayCloseDue(minutes: number, lastMealTime: string | null): boolean {
  const from = Math.max(at(DAY_CLOSE_FROM), lastMealTime ? at(lastMealTime) + 60 : 0);
  return minutes >= Math.min(from, 23 * 60 + 30);
}

export function dayCloseCard(input: { date: string; summary: string; next: { date: string; meals: DayMealLine[] } }): { text: string; card: PlanAdjustCard } {
  const meals = input.next.meals.filter((m) => m.status === "planned");
  const lines = meals.map((m) => `${SLOT_LABEL[m.slot]}${m.time ? ` ${clock(m.time)}` : ""}: ${m.title} (${fmt(m.kcal)} kcal)`);
  return {
    text: [input.summary, meals.length ? "Tomorrow:" : null, ...lines].filter(Boolean).join("\n"),
    card: { type: "plan_adjust", kind: "day_close", date: input.date, headline: input.summary, lines: [], next: { date: input.next.date, meals } },
  };
}

/** Closes today once, at night: spreads a miss over the next days and shows tomorrow's meals. */
export async function runDayClose(ctx: ActionContext, now = new Date()): Promise<"posted" | "not_yet" | "exists" | "no_plan"> {
  const date = localDateKey(now, ctx.timezone);
  const { minutes } = localClock(now, ctx.timezone);
  if (minutes < at(DAY_CLOSE_FROM)) return "not_yet";
  const turnId = stableTurnId(`magnus-day-close:${ctx.userProfileId}:${date}`);
  if (await exists(ctx.userProfileId, turnId)) return "exists";
  const { data: prefsRow } = await supabase.from("health_diet_preferences").select("user_profile_id").eq("user_profile_id", ctx.userProfileId).maybeSingle();
  if (!prefsRow) return "no_plan";
  const view = await planViewOrNull(ctx, now);
  if (!view?.plan) return "no_plan";
  const today = mealsOn(view, date);
  const last = today.map((m) => m.time).filter((t): t is string => !!t).sort().at(-1) ?? null;
  if (!dayCloseDue(minutes, last)) return "not_yet";

  const { totals, slots } = await eatenOn(ctx.userProfileId, date);
  let summary: string;
  if (slots.size >= DAY_CLOSE_MIN_MEALS) {
    const c = closeDay({ date, target: view.plan.targets, eaten: totals, floorKcal: FLOOR_KCAL });
    await saveCarry(ctx.userProfileId, date, c.carry);
    summary = c.summary;
  } else {
    summary = slots.size
      ? "Only one meal logged today, so tomorrow's plan stays as it is."
      : "No meals logged today, so tomorrow's plan stays as it is.";
  }
  // Re-read so tomorrow shows with any carry-over applied.
  const after = (await planViewOrNull(ctx, now)) ?? view;
  const tomorrow = addDays(date, 1);
  const { text, card } = dayCloseCard({ date, summary, next: { date: tomorrow, meals: mealLines(after, tomorrow) } });
  return (await postOnce(ctx.userProfileId, turnId, text, [card])) ? "posted" : "exists";
}
