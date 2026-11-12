/**
 * Usual meals: what the person logs again and again (the same breakfast, the office lunch), so
 * logging it is one tap instead of a typed message and an estimate.
 *
 * Meals are grouped by their text as logged. Each usual meal carries the items from its most
 * recent log, so a portion fixed once on the card stays fixed. Repeating one makes a fresh draft
 * card (new id), never a direct save: the person still confirms, and can tweak the portion.
 */
import { randomUUID } from "node:crypto";

import { getLocalTimeParts } from "../nutrition/localDate.js";
import { estimateCacheKey } from "../meals/estimateMealNutrition.js";
import { localDateKey, resolveTimezone } from "../nutrition/localDate.js";
import { supabase } from "../tools/clients.js";
import { MFP_RAW_TEXT } from "./mfpImport.js";
import type { ActionContext } from "./actions.js";
import { recordChatTurn, type ChatReply } from "./chat.js";
import {
  ESTIMATE_SOURCES,
  slotForLocalHour,
  sumItems,
  type AppMealSlot,
  type EstimateSource,
  type MealDraft,
  type MealItem,
  type MealTotals,
} from "./meals.js";
import { DAY_MS } from "../util/time.js";
import { logDraftNow, quickLogOn } from "./quickLog.js";

export const FREQUENT_WINDOW_DAYS = 60;
export const MIN_REPEATS = 2;
const MAX_ROWS = 2000;

export type LoggedSession = {
  mealSessionId: string;
  text: string;
  slot: string;
  localDate: string;
  loggedAt: string;
  source: string;
  items: MealItem[];
};

export type UsualMeal = {
  /** Normalized text; what /meals/repeat takes. */
  key: string;
  text: string;
  slot: Exclude<AppMealSlot, "unspecified">;
  count: number;
  lastDate: string;
  source: EstimateSource;
  items: MealItem[];
  totals: MealTotals;
};

const SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;

/**
 * Meals logged at least twice, best first: ones usually eaten at `slot` lead, then by how often
 * (recent logs count more), then by how recently.
 */
export function rankUsualMeals(
  sessions: LoggedSession[],
  opts: { today: string; slot?: AppMealSlot; limit?: number },
): UsualMeal[] {
  const todayN = Date.parse(`${opts.today}T00:00:00Z`) / DAY_MS;
  const groups = new Map<string, LoggedSession[]>();
  for (const s of sessions) {
    if (!s.items.length || !s.text.trim()) continue;
    const key = estimateCacheKey(s.text);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }

  const scored: Array<UsualMeal & { score: number; slotMatch: boolean }> = [];
  for (const [key, list] of groups) {
    if (list.length < MIN_REPEATS) continue;
    list.sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
    const latest = list[0]!;
    const slotCounts = new Map<string, number>();
    for (const s of list) slotCounts.set(s.slot, (slotCounts.get(s.slot) ?? 0) + 1);
    const [topSlot, topCount] = SLOTS.map((k) => [k, slotCounts.get(k) ?? 0] as const).sort((a, b) => b[1] - a[1])[0]!;
    const usualSlot = topCount > 0 ? topSlot : "snack";
    // A log from today weighs 1, one from 30 days ago about 0.5.
    const score = list.reduce((sum, s) => sum + 0.5 ** ((todayN - Date.parse(`${s.localDate}T00:00:00Z`) / DAY_MS) / 30), 0);
    const source = (ESTIMATE_SOURCES as readonly string[]).includes(latest.source) ? (latest.source as EstimateSource) : "food_db";
    scored.push({
      key,
      text: latest.text,
      slot: usualSlot,
      count: list.length,
      lastDate: latest.localDate,
      source,
      items: latest.items,
      totals: sumItems(latest.items),
      score,
      slotMatch: opts.slot !== undefined && opts.slot !== "unspecified" && usualSlot === opts.slot,
    });
  }
  return scored
    .sort((a, b) => Number(b.slotMatch) - Number(a.slotMatch) || b.score - a.score || b.lastDate.localeCompare(a.lastDate))
    .slice(0, opts.limit ?? 8)
    .map(({ score: _s, slotMatch: _m, ...m }) => m);
}

const n = (v: unknown): number => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) && x >= 0 ? x : 0;
};

/** Confirmed meals from the last 60 days, one entry per meal with its items in order. */
export async function loadLoggedSessions(userProfileId: string, sinceDate: string): Promise<LoggedSession[]> {
  const { data, error } = await supabase
    .from("meal_logs")
    .select("meal_session_id, raw_text, description, meal_slot, local_date, logged_at, created_at, estimate_source, calories, protein_g, carbs_g, fat_g, component_index")
    .eq("user_profile_id", userProfileId)
    .is("deleted_at", null)
    .gte("local_date", sinceDate)
    .order("logged_at", { ascending: false })
    .limit(MAX_ROWS);
  if (error || !data) return [];
  const bySession = new Map<string, { s: LoggedSession; rows: Array<{ idx: number; item: MealItem }> }>();
  for (const r of data) {
    const id = r.meal_session_id ? String(r.meal_session_id) : "";
    // Imported days are whole-meal totals ("Lunch (MyFitnessPal)"), not meals to repeat.
    if (!id || r.raw_text === MFP_RAW_TEXT) continue;
    let entry = bySession.get(id);
    if (!entry) {
      entry = {
        s: {
          mealSessionId: id,
          text: String(r.raw_text ?? "").trim(),
          slot: String(r.meal_slot ?? "snack"),
          localDate: String(r.local_date),
          loggedAt: String(r.logged_at ?? r.created_at ?? ""),
          source: String(r.estimate_source ?? "food_db"),
          items: [],
        },
        rows: [],
      };
      bySession.set(id, entry);
    }
    entry.rows.push({
      idx: Number(r.component_index) || 0,
      item: {
        name: String(r.description ?? r.raw_text ?? "").trim().slice(0, 200) || "Item",
        calories: Math.round(n(r.calories)),
        protein_g: Math.round(n(r.protein_g) * 10) / 10,
        carbs_g: Math.round(n(r.carbs_g) * 10) / 10,
        fat_g: Math.round(n(r.fat_g) * 10) / 10,
      },
    });
  }
  return [...bySession.values()].map(({ s, rows }) => ({ ...s, items: rows.sort((a, b) => a.idx - b.idx).map((r) => r.item) }));
}

function context(ctx: ActionContext): { today: string; slot: Exclude<AppMealSlot, "unspecified"> } {
  const now = ctx.now ?? new Date();
  const tz = resolveTimezone(ctx.timezone);
  return { today: localDateKey(now, tz), slot: slotForLocalHour(getLocalTimeParts(now, tz).hour) };
}

export async function getUsualMeals(ctx: ActionContext, limit = 8): Promise<{ slot: string; meals: UsualMeal[] }> {
  const { today, slot } = context(ctx);
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - FREQUENT_WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10);
  const sessions = await loadLoggedSessions(ctx.userProfileId, since);
  return { slot, meals: rankUsualMeals(sessions, { today, slot, limit }) };
}

/** A fresh draft from a usual meal: same items, new id, slot from the clock unless it's a snack. */
export function draftFromUsual(meal: UsualMeal, slot: Exclude<AppMealSlot, "unspecified">): MealDraft {
  return {
    draftId: randomUUID(),
    text: meal.text,
    // A usual snack stays a snack; a usual meal goes to the slot it's being eaten in.
    slot: meal.slot === "snack" ? "snack" : slot,
    source: meal.source,
    items: meal.items.map((i) => ({ ...i })),
    totals: meal.totals,
    estimated: true,
    servingAssumption: null,
  };
}

export function repeatReplyText(meal: UsualMeal, logged = false): string {
  return logged
    ? `Logged, same as last time: about ${meal.totals.calories} kcal and ${Math.round(meal.totals.protein_g)} g protein. If the portion was different today, tap Edit on the card, or Undo.`
    : `Same as last time: about ${meal.totals.calories} kcal and ${Math.round(meal.totals.protein_g)} g protein. Change the portion on the card if it's different today, then tap Confirm & log.`;
}

export type RepeatResult = ({ ok: true } & ChatReply) | { ok: false; error: "meal_not_found" };

/**
 * One tap on a usual meal logs it straight away (12 Nov plan, item 5): the numbers are their own
 * from last time, so a confirm step adds nothing but a chance to drop the log. The card shows it as
 * logged with Edit and Undo. If the save fails, or quick logging is off, it's a draft to confirm.
 */
export async function repeatUsualMeal(
  ctx: ActionContext,
  key: string,
  deps: { usual?: typeof getUsualMeals; record?: typeof recordChatTurn; log?: typeof logDraftNow } = {},
): Promise<RepeatResult> {
  const { slot, today } = context(ctx);
  const { meals } = await (deps.usual ?? getUsualMeals)(ctx, 50);
  const meal = meals.find((m) => m.key === key);
  if (!meal) return { ok: false, error: "meal_not_found" };
  const draft: MealDraft = { ...draftFromUsual(meal, slot), date: today };
  const logged = quickLogOn() ? await (deps.log ?? logDraftNow)(ctx, draft) : null;
  const text = repeatReplyText(meal, !!logged);
  const cards = [logged ?? { type: "meal_draft" as const, draft }];
  await (deps.record ?? recordChatTurn)(ctx.userProfileId, `Usual: ${meal.text}`, text, cards);
  return { ok: true, text, cards, changed: !!logged };
}

/** What they ate at `slot` on `date`, as one meal to log again (all of that slot's logs merged); null when nothing. Pure. */
export function slotMealOn(sessions: LoggedSession[], date: string, slot: Exclude<AppMealSlot, "unspecified">): { text: string; source: EstimateSource; items: MealItem[]; totals: MealTotals } | null {
  const hits = sessions.filter((x) => x.localDate === date && x.slot === slot && x.items.length).sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
  if (!hits.length) return null;
  const items = hits.flatMap((h) => h.items.map((i) => ({ ...i })));
  const source = (ESTIMATE_SOURCES as readonly string[]).includes(hits[0]!.source) ? (hits[0]!.source as EstimateSource) : "food_db";
  return { text: hits.map((h) => h.text).filter(Boolean).join(" + ").slice(0, 500) || items.map((i) => i.name).join(", ").slice(0, 500), source, items, totals: sumItems(items) };
}

/** "Same as yesterday" for a meal: yesterday's log at that slot, ready to log again; null when there was none. */
export async function yesterdaysMeal(ctx: ActionContext, slot: Exclude<AppMealSlot, "unspecified">): Promise<ReturnType<typeof slotMealOn>> {
  const { today } = context(ctx);
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
  return slotMealOn(await loadLoggedSessions(ctx.userProfileId, yesterday), yesterday, slot);
}
