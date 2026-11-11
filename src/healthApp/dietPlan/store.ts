/**
 * Storage and the service calls behind the diet plan API: setup answers, plan versions, option
 * marks, and the rolling 3-day picks in `meal_plan_entries`.
 */
import { applyCarries } from "./carry.js";
import { logger } from "../../logger.js";
import { localDateKey } from "../../nutrition/localDate.js";
import { supabase } from "../../tools/clients.js";
import { loggableError } from "../../util/loggableError.js";
import { addDays } from "../../util/time.js";
import type { ActionContext } from "../actions.js";
import { getBodyCheckins, updateDailyTargets } from "../bodyStore.js";
import { acceptedTarget, gapCause, gapsLine, openGaps, planGapsOf, plannedAverages, plannedProtein, proteinGapOf, rulesKey, type GapChoice, type GapKey, type NutrientGap, type ProteinGap } from "./proteinGap.js";
import { FREQUENT_WINDOW_DAYS, loadLoggedSessions, rankUsualMeals } from "../frequentMeals.js";
import { cleanAvoidList, loadFoodPrefs, saveFoodAvoid } from "../onboarding.js";
import { loadHealthProfile } from "../snapshot.js";
import { buildPlanDraft, type PlanDraft } from "./build.js";
import { activeOverride, type DietOverride, type PeriodDiet } from "./dietPeriod.js";
import { checkOn, isFastingDay, itemsAllowedOn, planRules, type PlanRules } from "./rules.js";
import type { MealOption } from "./compose.js";
import { catalog } from "../../meals/catalog/index.js";
import { pickDays, PLAN_DAYS, type DayPick, type PriorPick } from "./pick.js";
import { defaultPrefs, dietPrefsInput, type DietPrefs, type DietPrefsInput } from "./prefs.js";
import { reviewEnabled, reviewPlan } from "./review.js";
import { supplementChoices, supplementLines, type SupplementLine } from "./supplements.js";
import { accountDay, type DayAccount } from "./dayAccount.js";
import { buildDayMeals, groupMeals, type DayMeals, type LoggedMeal, type MealRow, type PlanEntryLite } from "../dayMeals.js";
import { PLAN_SLOTS, type MacroTargets, type MealBudget, type PlanSlot } from "./targets.js";

export type PrefsRow = { prefs: DietPrefs; saved: boolean; pinned: string[]; liked: string[]; hidden: string[] };

export async function loadDietPrefs(userProfileId: string): Promise<PrefsRow> {
  const { data, error } = await supabase
    .from("health_diet_preferences")
    .select("prefs, pinned_options, liked_options, hidden_options")
    .eq("user_profile_id", userProfileId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { prefs: defaultPrefs(), saved: false, pinned: [], liked: [], hidden: [] };
  const parsed = dietPrefsInput.safeParse(data.prefs);
  return {
    prefs: parsed.success ? parsed.data : defaultPrefs(),
    saved: parsed.success,
    pinned: (data.pinned_options as string[] | null) ?? [],
    liked: (data.liked_options as string[] | null) ?? [],
    hidden: (data.hidden_options as string[] | null) ?? [],
  };
}

export async function saveDietPrefs(userProfileId: string, input: DietPrefsInput): Promise<DietPrefs> {
  const parsed = dietPrefsInput.parse(input);
  // The setup screen doesn't send these: saving its answers must not wipe a running temporary diet,
  // what they never cook, or the skipped-today list.
  const raw = (input ?? {}) as Record<string, unknown>;
  const missing = ["dietOverride", "habits", "unavailable", "proteinGap", "planGapsOk"].filter((k) => !(k in raw));
  let prefs = parsed;
  if (missing.length) {
    const old = await loadDietPrefs(userProfileId);
    prefs = { ...parsed, ...Object.fromEntries(missing.map((k) => [k, (old.prefs as Record<string, unknown>)[k]])) } as DietPrefs;
  }
  const { error } = await supabase
    .from("health_diet_preferences")
    .upsert({ user_profile_id: userProfileId, prefs, updated_at: new Date().toISOString() }, { onConflict: "user_profile_id" });
  if (error) throw new Error(error.message);
  return prefs;
}

/** Marks the entry as the supplements log (raw_text), so it can be found, shown as taken, and undone. */
export const SUPPLEMENTS_TEXT = "Daily supplements";

/** The open supplements entry for a day, if one was logged. */
export async function supplementSessionOn(userProfileId: string, date: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("meal_logs")
    .select("meal_session_id")
    .eq("user_profile_id", userProfileId)
    .eq("local_date", date)
    .eq("raw_text", SUPPLEMENTS_TEXT)
    .is("deleted_at", null)
    .limit(1);
  if (error) throw new Error(error.message);
  return ((data ?? [])[0]?.meal_session_id as string | undefined) ?? null;
}

/** Everything logged on a day (meals, supplements, chat logs), as the Today screen counts it. */
/** Every meal logged on a date, grouped into meals (supplements and chat logs included). */
async function loggedMealsOn(userProfileId: string, date: string): Promise<LoggedMeal[]> {
  const { data, error } = await supabase
    .from("meal_logs")
    .select("meal_session_id, local_date, meal_slot, raw_text, description, calories, protein_g, carbs_g, fat_g, logged_at, created_at, component_index")
    .eq("user_profile_id", userProfileId)
    .eq("local_date", date)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  return groupMeals((data ?? []) as MealRow[]).get(date) ?? [];
}

/** A planned meal as the day list needs it. */
function plannedLite(p: PlannedMeal): PlanEntryLite {
  return {
    slot: p.slot,
    kind: p.kind === "eat_out" ? "eat_out" : "option",
    status: p.status,
    title: p.title,
    items: p.items,
    totals: p.totals,
    loggedSessionId: p.loggedSessionId ?? null,
    offPlan: p.offPlan === true,
  };
}

export const OPTION_ACTIONS = ["pin", "unpin", "like", "unlike", "hide", "unhide"] as const;
export type OptionAction = (typeof OPTION_ACTIONS)[number];

/** Pin, like or hide an option. Marks are by option id, so they carry over to later plan versions. */
const MAX_MARKS = 300;

export async function markOption(userProfileId: string, optionId: string, action: OptionAction): Promise<PrefsRow> {
  const row = await loadDietPrefs(userProfileId);
  const col = action.includes("pin") ? "pinned" : action.includes("like") ? "liked" : "hidden";
  const add = !action.startsWith("un");
  const set = new Set(row[col]);
  if (add) set.add(optionId);
  else set.delete(optionId);
  // Option ids change with every plan rebuild; keep the newest few hundred so the row can't grow forever.
  while (set.size > MAX_MARKS) set.delete(set.values().next().value as string);
  // A hidden option can't stay pinned.
  if (action === "hide") row.pinned = row.pinned.filter((x) => x !== optionId);
  const next = { ...row, [col]: [...set] };
  const { error } = await supabase.from("health_diet_preferences").upsert(
    {
      user_profile_id: userProfileId,
      prefs: row.prefs,
      pinned_options: next.pinned,
      liked_options: next.liked,
      hidden_options: next.hidden,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_profile_id" },
  );
  if (error) throw new Error(error.message);
  if (action === "hide") await dropFuturePicks(userProfileId, null, { optionId });
  return next;
}

// ---------- plan versions ----------

export type ActivePlan = {
  id: string;
  version: number;
  targets: MacroTargets;
  budgets: MealBudget[];
  options: Partial<Record<PlanSlot, MealOption[]>>;
  review: unknown;
  createdAt: string;
};

type OptionMeta = { novelty: boolean; prep: MealOption["prep"] | null; proteinGroup: string | null; onlyDays?: number[] };

type OptionRow = {
  id: string;
  slot: PlanSlot;
  position: number;
  title: string;
  items: MealOption["items"];
  totals: MealOption["totals"];
  origin: MealOption["origin"];
  usual_key: string | null;
  prep_minutes: number;
};

export async function loadActivePlan(userProfileId: string): Promise<ActivePlan | null> {
  const { data: plan, error } = await supabase
    .from("health_diet_plans")
    .select("id, version, targets, budgets, review, created_at")
    .eq("user_profile_id", userProfileId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!plan) return null;
  const { data: rows, error: e2 } = await supabase
    .from("health_diet_plan_options")
    .select("id, slot, position, title, items, totals, origin, usual_key, prep_minutes")
    .eq("plan_id", plan.id)
    .order("position", { ascending: true });
  if (e2) throw new Error(e2.message);
  const options: ActivePlan["options"] = {};
  for (const r of (rows ?? []) as OptionRow[]) {
    // Novelty, prep and protein ride along inside the totals column (no schema change); split them out.
    const { meta, ...totals } = r.totals as MealOption["totals"] & { meta?: OptionMeta };
    (options[r.slot] ??= []).push({
      id: r.id,
      slot: r.slot,
      title: r.title,
      items: r.items,
      totals,
      ...(meta?.novelty ? { novelty: true } : {}),
      ...(meta?.prep ? { prep: meta.prep } : {}),
      ...(meta?.proteinGroup !== undefined ? { proteinGroup: meta.proteinGroup } : {}),
      ...(meta?.onlyDays?.length ? { onlyDays: meta.onlyDays } : {}),
      origin: r.origin,
      prepMinutes: r.prep_minutes,
      ...(r.usual_key ? { usualKey: r.usual_key } : {}),
    });
  }
  return {
    id: String(plan.id),
    version: Number(plan.version),
    targets: plan.targets as MacroTargets,
    budgets: plan.budgets as MealBudget[],
    options,
    review: plan.review,
    createdAt: String(plan.created_at),
  };
}

async function savePlan(userProfileId: string, draft: PlanDraft, reason: string, previous: ActivePlan | null): Promise<ActivePlan> {
  if (previous) {
    const { error } = await supabase.from("health_diet_plans").update({ status: "archived" }).eq("id", previous.id);
    if (error) throw new Error(error.message);
  }
  const { data: last } = await supabase
    .from("health_diet_plans")
    .select("version")
    .eq("user_profile_id", userProfileId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = Number(last?.version ?? 0) + 1;
  const { data: plan, error } = await supabase
    .from("health_diet_plans")
    .insert({
      user_profile_id: userProfileId,
      version,
      targets: draft.targets,
      budgets: draft.budgets,
      reason,
      replaces_id: previous?.id ?? null,
      review: draft.review,
    })
    .select("id, created_at")
    .single();
  if (error || !plan) {
    // Put the old plan back rather than leave the person with none.
    if (previous) await supabase.from("health_diet_plans").update({ status: "active" }).eq("id", previous.id);
    throw new Error(error?.message ?? "plan insert failed");
  }
  const rows = PLAN_SLOTS.flatMap((slot) =>
    (draft.options[slot] ?? []).map((o, position) => ({
      plan_id: plan.id,
      id: o.id,
      user_profile_id: userProfileId,
      slot,
      position,
      title: o.title,
      items: o.items,
      totals: { ...o.totals, meta: { novelty: !!o.novelty, prep: o.prep ?? null, proteinGroup: o.proteinGroup ?? null, ...(o.onlyDays?.length ? { onlyDays: o.onlyDays } : {}) } satisfies OptionMeta },
      origin: o.origin,
      usual_key: o.usualKey ?? null,
      prep_minutes: o.prepMinutes,
    })),
  );
  if (rows.length) {
    const { error: e2 } = await supabase.from("health_diet_plan_options").insert(rows);
    if (e2) throw new Error(e2.message);
  }
  return { id: String(plan.id), version, targets: draft.targets, budgets: draft.budgets, options: draft.options, review: draft.review, createdAt: String(plan.created_at) };
}

/** Everything a plan is built from, read fresh. */
async function planInputs(ctx: ActionContext, today: string) {
  const [profile, food, prefs, checkins, sessions] = await Promise.all([
    loadHealthProfile(ctx.userProfileId),
    loadFoodPrefs(ctx.userProfileId),
    loadDietPrefs(ctx.userProfileId),
    getBodyCheckins(ctx.userProfileId, addDays(today, -60)),
    loadLoggedSessions(ctx.userProfileId, addDays(today, -FREQUENT_WINDOW_DAYS)),
  ]);
  const weight = [...checkins].reverse().find((c) => c.weight_kg !== null)?.weight_kg ?? null;
  const usual = PLAN_SLOTS.flatMap((slot) => rankUsualMeals(sessions, { today, slot, limit: 4 }).filter((u) => u.slot === slot));
  return { profile, food, prefs, weight, usual };
}

export type BuildResult = { ok: true; plan: ActivePlan } | { ok: false; error: "no_targets" | "no_setup" };

/** Builds and saves a new plan version, then re-picks the days after today. */
export async function rebuildPlan(ctx: ActionContext, reason: string, now = new Date()): Promise<BuildResult> {
  const today = localDateKey(now, ctx.timezone);
  const { profile, food, prefs, weight, usual } = await planInputs(ctx, today);
  const { calorieTarget, proteinTarget } = profile.targets;
  if (!calorieTarget || !proteinTarget) return { ok: false, error: "no_targets" };
  if (!prefs.saved) return { ok: false, error: "no_setup" };
  const draft = await buildPlanDraft({
    calories: calorieTarget,
    proteinG: proteinTarget,
    weightKg: weight,
    prefs: prefs.prefs,
    rules: planRules(food, prefs.prefs, today),
    usual,
    hidden: prefs.hidden,
    review: reviewEnabled() ? reviewPlan : undefined,
  });
  const previous = await loadActivePlan(ctx.userProfileId);
  const plan = await savePlan(ctx.userProfileId, draft, reason, previous);
  // Today keeps its picks (the same-day rebalance handles today); later days are picked again.
  // After a diet or food-list change, or "Make me a fresh plan", today's meals not yet eaten go too, so nothing they ruled out stays.
  // "Make me a fresh plan" replaces every meal not yet eaten, hand edits too. A change to their food
  // rules re-picks today's meals as well; meals they edited by hand stay unless they now break a rule
  // (ensureDays drops those). Any other rebuild leaves today alone.
  const fresh = reason === "rebuild";
  const fromToday = fresh || reason === "food_prefs_changed" || reason === "diet_period" || reason === "diet_period_end";
  await dropFuturePicks(ctx.userProfileId, fromToday ? today : addDays(today, 1), { keepCustom: !fresh });
  logger.info({ userProfileId: ctx.userProfileId, version: plan.version, reason, reviewed: !!draft.review }, "diet plan built");
  return { ok: true, plan };
}

/**
 * Why a plan-setup save rebuilds: a change to what they can eat or when (restrictions, fasting
 * days, meals eaten out) re-picks today's meals too; anything else (meal times, cooking time)
 * leaves today as it is.
 */
export function prefsChangeReason(before: DietPrefs, after: DietPrefs): "food_prefs_changed" | "prefs_changed" {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
  const eatOut = (p: DietPrefs) => p.eatOut.map((e) => `${e.day}:${e.slot}`).sort();
  return same(before.restrictions, after.restrictions) && same(sorted(before.fastingDays), sorted(after.fastingDays)) && same(eatOut(before), eatOut(after))
    ? "prefs_changed"
    : "food_prefs_changed";
}

/** What the person's food settings allow right now (diet, avoid list, diet note, plan restrictions). */
export async function rulesFor(userProfileId: string, prefs: DietPrefs, today: string): Promise<PlanRules> {
  return planRules(await loadFoodPrefs(userProfileId), prefs, today);
}

type ItemLike = Array<{ key: string | null; name: string }> | undefined;

// ---------- the 3-day picks ----------

type EntryRow = { id: string; local_date: string; meal_slot: PlanSlot; title: string; status: string; metadata: Record<string, unknown> | null; estimated_calories: number | null };

/** Removes planned (not yet eaten) picks from `fromDate` on, or every future pick of one option. */
async function dropFuturePicks(userProfileId: string, fromDate: string | null, opts: { optionId?: string; keepCustom?: boolean } = {}): Promise<void> {
  let q = supabase.from("meal_plan_entries").delete().eq("user_profile_id", userProfileId).eq("source", "plan").eq("status", "planned");
  if (fromDate) q = q.gte("local_date", fromDate);
  // Meals they edited or swapped by hand stay through a rebuild (ensureDays drops any that now break their diet).
  if (opts.keepCustom) q = q.or("metadata->>edited.is.null,metadata->>edited.neq.true").or("metadata->>swapped.is.null,metadata->>swapped.neq.true");
  if (opts.optionId) q = q.eq("metadata->>option_id", opts.optionId);
  const { error } = await q;
  if (error) logger.warn({ err: loggableError(error) }, "dropping planned meals failed");
}

async function loadEntries(userProfileId: string, from: string, to: string): Promise<EntryRow[]> {
  const { data, error } = await supabase
    .from("meal_plan_entries")
    .select("id, local_date, meal_slot, title, status, metadata, estimated_calories")
    .eq("user_profile_id", userProfileId)
    .gte("local_date", from)
    .lte("local_date", to)
    // Skipped meals hold their slot, so the plan never refills a meal they said they skipped.
    .in("status", ["planned", "logged", "partial", "skipped"]);
  if (error) throw new Error(error.message);
  return (data ?? []) as EntryRow[];
}

function entryRow(userProfileId: string, planId: string, p: DayPick, option: MealOption | undefined) {
  return {
    user_profile_id: userProfileId,
    local_date: p.date,
    meal_slot: p.slot,
    title: p.title,
    estimated_calories: p.totals.kcal,
    estimated_protein_g: p.totals.proteinG,
    estimated_carbs_g: p.totals.carbsG,
    estimated_fat_g: p.totals.fatG,
    status: "planned",
    source: "plan",
    metadata: { plan_id: planId, option_id: p.optionId, kind: p.kind, items: option?.items ?? [], totals: p.totals },
  };
}

export type PlannedMeal = DayPick & {
  entryId: string | null;
  status: string;
  items: MealOption["items"];
  /** When eaten with changed portions: what they ate. */
  eatenItems?: MealOption["items"];
  loggedSessionId?: string;
  /** Eaten by logging their own food for it (chat, photo, the meal sheet), not "Ate this". */
  offPlan?: boolean;
  /** Items were added or removed in the meal editor. */
  edited?: boolean;
};

/** Today and the next two days, picking and saving any meal not yet planned. */
export async function ensureDays(ctx: ActionContext, plan: ActivePlan, prefs: PrefsRow, today: string): Promise<PlannedMeal[]> {
  const to = addDays(today, PLAN_DAYS - 1);
  let rows = await loadEntries(ctx.userProfileId, addDays(today, -2), to);
  // A planned meal made before they changed their diet or note, with food it now rules out, is picked again.
  const rules = await rulesFor(ctx.userProfileId, prefs.prefs, today);
  const stale = rows.filter((r) => r.status === "planned" && r.local_date >= today && r.metadata?.kind !== "eat_out" && !itemsAllowedOn(rules, r.local_date, r.metadata?.items as ItemLike));
  if (stale.length) {
    await supabase.from("meal_plan_entries").delete().in("id", stale.map((r) => r.id)).eq("status", "planned");
    const gone = new Set(stale.map((r) => r.id));
    rows = rows.filter((r) => !gone.has(r.id));
  }
  const existing: PriorPick[] = rows.map((r) => ({
    date: r.local_date,
    slot: r.meal_slot,
    optionId: (r.metadata?.option_id as string | null) ?? null,
    title: r.title,
    totals: r.metadata?.totals as PriorPick["totals"],
    kind: r.metadata?.kind as PriorPick["kind"],
  }));
  const checks = new Map<string, ReturnType<typeof checkOn>>();
  const picks = pickDays({
    start: today, budgets: plan.budgets, options: plan.options, prefs: prefs.prefs, pinned: prefs.pinned, existing, unavailable: prefs.prefs.unavailable,
    // Weekday rules ("no onion on Tuesdays") and fasting days: only options that keep them on that date.
    allowOn: (date, o) => o.items.every((checks.get(date) ?? checks.set(date, checkOn(rules, date)).get(date)!)),
    fastingOn: (date) => isFastingDay(rules, date),
  });
  const byId = new Map(Object.values(plan.options).flat().map((o) => [o!.id, o!]));
  const known = new Map(rows.map((r) => [`${r.local_date}|${r.meal_slot}`, r]));
  const missing = picks.filter((p) => !known.has(`${p.date}|${p.slot}`));
  if (missing.length) {
    const { data, error } = await supabase
      .from("meal_plan_entries")
      .insert(missing.map((p) => entryRow(ctx.userProfileId, plan.id, p, p.optionId ? byId.get(p.optionId) : undefined)))
      .select("id, local_date, meal_slot, title, status, metadata, estimated_calories");
    // Another screen planned the same day at the same moment: the unique index kept one; read it back.
    if (error && error.code !== "23505") throw new Error(error.message);
    for (const r of (data ?? []) as EntryRow[]) known.set(`${r.local_date}|${r.meal_slot}`, r);
    if (error) for (const r of await loadEntries(ctx.userProfileId, today, to)) known.set(`${r.local_date}|${r.meal_slot}`, r);
  }
  // A day close moved calories onto these days: resize any meal that hasn't taken it yet.
  if (await applyCarries(ctx.userProfileId, plan.budgets, today, to).catch(() => false)) {
    for (const r of await loadEntries(ctx.userProfileId, today, to)) known.set(`${r.local_date}|${r.meal_slot}`, r);
  }
  return picks.map((p) => {
    const r = known.get(`${p.date}|${p.slot}`);
    const items = (r?.metadata?.items as MealOption["items"] | undefined) ?? (p.optionId ? byId.get(p.optionId)?.items : undefined) ?? [];
    const eatenItems = r?.metadata?.eaten_items as MealOption["items"] | undefined;
    const loggedSessionId = r?.metadata?.logged_session_id as string | undefined;
    // A picked-again day keeps what was saved for it (a swap, or the pick it had before a rebuild).
    const saved = r && r.metadata?.option_id !== p.optionId
      ? { optionId: (r.metadata?.option_id as string | null) ?? null, title: r.title, totals: (r.metadata?.totals as DayPick["totals"]) ?? p.totals, kind: (r.metadata?.kind as DayPick["kind"]) ?? p.kind }
      : {};
    // Totals follow the saved items (a day-close carry or rebalance resized them).
    const totals = (r?.metadata?.totals as DayPick["totals"] | undefined) ?? p.totals;
    // An edited meal (items added or removed) goes by its own title.
    const edited = r?.metadata?.edited ? { title: r.title, edited: true } : {};
    return { ...p, totals, ...saved, ...edited, entryId: r?.id ?? null, status: r?.status ?? "planned", items, ...(eatenItems ? { eatenItems } : {}), ...(loggedSessionId ? { loggedSessionId } : {}), ...(r?.metadata?.off_plan === true ? { offPlan: true } : {}) };
  });
}

/** Swaps one planned meal for another option of the same meal. */
export async function swapPick(ctx: ActionContext, date: string, slot: PlanSlot, optionId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const plan = await loadActivePlan(ctx.userProfileId);
  const option = plan?.options[slot]?.find((o) => o.id === optionId);
  if (!plan || !option) return { ok: false, error: "option_not_found" };
  const prefsNow = await loadDietPrefs(ctx.userProfileId);
  if (!itemsAllowedOn(await rulesFor(ctx.userProfileId, prefsNow.prefs, localDateKey(ctx.now ?? new Date(), ctx.timezone)), date, option.items)) return { ok: false, error: "not_allowed" };
  const { data, error } = await supabase
    .from("meal_plan_entries")
    .update({
      title: option.title,
      estimated_calories: option.totals.kcal,
      estimated_protein_g: option.totals.proteinG,
      estimated_carbs_g: option.totals.carbsG,
      estimated_fat_g: option.totals.fatG,
      metadata: { plan_id: plan.id, option_id: option.id, kind: "option", items: option.items, totals: option.totals, swapped: true },
      updated_at: new Date().toISOString(),
    })
    .eq("user_profile_id", ctx.userProfileId)
    .eq("local_date", date)
    .eq("meal_slot", slot)
    .eq("status", "planned")
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ? { ok: true } : { ok: false, error: "meal_not_planned" };
}

export type PlanView = {
  ok: true;
  /** Today in the profile's timezone. The tab labels days from this, not from a cached client date. */
  today: string;
  setup: boolean;
  prefs: DietPrefs;
  marks: { pinned: string[]; liked: string[]; hidden: string[] };
  plan: Omit<ActivePlan, "review"> | null;
  days: PlannedMeal[];
  reviewOn: boolean;
  /** Daily supplements from the setup, and whether today's are logged. */
  supplements: { lines: SupplementLine[]; takenToday: boolean; choices: ReturnType<typeof supplementChoices> };
  /** No calorie or protein target yet: the plan has nothing to split, so the tab asks for them first. */
  needsTargets: boolean;
  /** Each planned day's numbers: targets, planned, supplements, eat-out allowances, logged (dayAccount.ts). */
  accounts?: DayAccount[];
  /** Each planned day's one meal list (dayMeals.ts): the same rows the Today tab shows. */
  lists?: DayMeals[];
  /** The planned meals can't reach the protein target under their rules (proteinGap.ts). */
  proteinGap?: ProteinGap | null;
  /** Every target the planned meals miss (protein included), shown together at build. */
  planGaps?: NutrientGap[];
  /** What limits the plan, in words, for the gaps card. */
  gapCause?: string;
  /** The gaps as one line for the coach and every plan-build reply. */
  gapsLine?: string | null;
};

/**
 * What the Meals tab shows. Builds the plan on first open after setup, and rebuilds it when the
 * profile's calorie or protein target has moved since (onboarding, review, intervention).
 */
export async function loadPlanView(ctx: ActionContext, now = new Date(), opts: { afterRetarget?: boolean; afterRestore?: boolean } = {}): Promise<PlanView | { ok: false; error: string }> {
  const today = localDateKey(now, ctx.timezone);
  const [prefs, profile] = await Promise.all([loadDietPrefs(ctx.userProfileId), loadHealthProfile(ctx.userProfileId)]);
  const t = profile.targets;
  const needsTargets = !t.calorieTarget || !t.proteinTarget;
  const lines = supplementLines(prefs.prefs.supplements);
  // Supplements are items in meals now; the old separate "Took them" log is no longer offered.
  const takenToday = false;
  const base = { today, prefs: prefs.prefs, marks: { pinned: prefs.pinned, liked: prefs.liked, hidden: prefs.hidden }, reviewOn: reviewEnabled(), needsTargets, supplements: { lines, takenToday, choices: supplementChoices() } };
  if (!prefs.saved || needsTargets) return { ok: true, setup: prefs.saved, plan: null, days: [], ...base };
  let plan = await loadActivePlan(ctx.userProfileId);
  // A temporary diet that has run out: back to their own diet, with fresh options.
  const ov = prefs.prefs.dietOverride;
  if (ov && !activeOverride(ov, today)) {
    prefs.prefs = await saveDietPrefs(ctx.userProfileId, { ...prefs.prefs, dietOverride: null });
    const r = await rebuildPlan(ctx, "diet_period_end", now);
    if (!r.ok) return r;
    plan = r.plan;
    base.prefs = prefs.prefs;
  }
  // A plan built before supplements became meal items has none in its options: rebuild it once.
  const suppKeys = new Set(lines.map((l) => l.key));
  const missingSupps = !!plan && suppKeys.size > 0 && !Object.values(plan.options).flat().some((o) => o!.items.some((i) => i.key && suppKeys.has(i.key)));
  const stale = plan && (missingSupps || plan.targets.calories !== Math.round(t.calorieTarget ?? 0) || plan.targets.proteinG !== Math.round(t.proteinTarget ?? 0));
  if (!plan || stale) {
    const r = await rebuildPlan(ctx, plan ? "target_change" : "setup", now);
    if (!r.ok) return r;
    // New targets: today's meals still to come resize to them (a rebuild keeps today's picks),
    // then the view is read again with those sizes. The plan isn't stale any more, so this runs once.
    if (plan && !opts.afterRetarget) {
      const { rebalanceToday } = await import("./rhythm.js");
      await rebalanceToday(ctx, now).catch((err) => logger.warn({ err }, "rebalance after a target change failed"));
      return loadPlanView(ctx, now, { ...opts, afterRetarget: true });
    }
    plan = r.plan;
  }
  // Options saved in an older plan version may include food they have since ruled out: never show them.
  const rules = await rulesFor(ctx.userProfileId, prefs.prefs, today);
  const every = { ...rules, days: {} };
  plan = { ...plan, options: Object.fromEntries(Object.entries(plan.options).map(([slot, list]) => [slot, (list ?? []).filter((o) => itemsAllowedOn(every, today, o.items))])) as typeof plan.options };
  const days = await ensureDays(ctx, plan, prefs, today);
  const { review: _r, ...rest } = plan;
  const dates = [...new Set(days.map((x) => x.date))];
  const logs = await loggedMealsOn(ctx.userProfileId, today);
  const times: Partial<Record<PlanSlot, string>> = {};
  for (const m of prefs.prefs.meals) if (m.time) times[m.slot as PlanSlot] = m.time;
  const lists = dates.map((date) => buildDayMeals({ date, today, plan: days.filter((x) => x.date === date).map(plannedLite), logs: date === today ? logs : [], times }));
  const accounts = dates.map((date, k) => accountDay({ date, targets: plan!.targets, meals: days.filter((x) => x.date === date), supplements: [], list: lists[k] }));
  // Protein the plan can't reach: shown with the choice, on every way the plan is opened or rebuilt.
  const key = rulesKey(rules, prefs.prefs);
  const stored = prefs.prefs.proteinGap ?? null;
  if (stored?.choice === "accept" && stored.rulesKey !== key && !opts.afterRestore) {
    // The rules behind an accepted gap changed (a veg period ended): the old target comes back.
    await restoreProteinTarget(ctx, prefs.prefs, t.proteinTarget ?? null).catch((err) => logger.warn({ err: loggableError(err) }, "protein target restore failed"));
    return loadPlanView(ctx, now, { ...opts, afterRestore: true });
  }
  const cause = gapCause(rules, prefs.prefs);
  const proteinGap = proteinGapOf({ plannedG: plannedProtein(accounts), targetG: plan.targets.proteinG, stored, key, cause });
  // Every other target too (Saksham, 11 Nov): calories, carbs, fat, fibre, flagged together at build.
  const fibre = new Map<string, number>();
  for (const m of days) if (m.kind !== "eat_out") fibre.set(m.date, (fibre.get(m.date) ?? 0) + (m.totals?.fiberG ?? 0));
  const averages = plannedAverages(accounts.map((a) => ({ planned: { ...a.planned, fiberG: fibre.get(a.date) ?? 0 }, allowances: a.allowances })));
  const t4 = plan.targets as typeof plan.targets & { fiberG?: number };
  const allGaps = planGapsOf(averages, { kcal: t4.calories, proteinG: t4.proteinG, carbsG: t4.carbsG, fatG: t4.fatG, fiberG: t4.fiberG ?? null }, proteinGap);
  const planGaps = openGaps(allGaps, prefs.prefs.planGapsOk, key);
  const kept = allGaps.filter((g) => !planGaps.includes(g)).map((g) => g.label.toLowerCase());
  const line = [gapsLine(planGaps, proteinGap, cause), kept.length ? `They kept ${kept.join(", ")} as the plan has it: don't flag ${kept.length === 1 ? "it" : "those"}.` : null].filter(Boolean).join(" ") || null;
  return { ok: true, setup: true, plan: rest, days, accounts, lists, proteinGap, planGaps, gapCause: cause, gapsLine: line, ...base };
}

// ---------- food rules changed from chat ----------

export type ReplanReport = {
  /** Planned meals (today on) that broke the new rules and were picked again. */
  replaced: Array<{ date: string; slot: PlanSlot; was: string; edited: boolean }>;
  /** Meals they changed by hand that still fit, left as they are. */
  keptEdits: Array<{ date: string; slot: PlanSlot }>;
  /** The plan now, so the reply can say what is really there. */
  meals: Array<{ date: string; slot: PlanSlot; meal: string; status: string }>;
  /** Planned meals that still break a rule: expected 0. */
  violations: number;
  /** The new rules leave the plan short of protein: say so and offer the choice (proteinGap.ts). */
  proteinGap?: string | null;
};

export type DietPeriodResult =
  | ({ ok: true; diet: PeriodDiet | null; avoid: string[]; from: string | null; until: string | null } & ReplanReport)
  | { ok: false; error: "no_setup" | "no_targets" | "bad_dates" | "nothing_to_change" };

/**
 * Applies a change to their food rules, rebuilds the plan and re-picks every planned meal from
 * today that now breaks a rule (meals they edited that still fit stay), then reports the plan as
 * it really is afterwards, so the coach can't describe a change that didn't happen.
 */
async function replanAfter(ctx: ActionContext, reason: string, now: Date): Promise<({ ok: true } & ReplanReport) | { ok: false; error: "no_setup" | "no_targets" }> {
  const today = localDateKey(now, ctx.timezone);
  const prefs = await loadDietPrefs(ctx.userProfileId);
  const rules = await rulesFor(ctx.userProfileId, prefs.prefs, today);
  const planned = (await loadEntries(ctx.userProfileId, today, addDays(today, PLAN_DAYS - 1))).filter((r) => r.status === "planned" && r.metadata?.kind !== "eat_out");
  const custom = (r: EntryRow) => r.metadata?.edited === true || r.metadata?.swapped === true;
  const bad = planned.filter((r) => !itemsAllowedOn(rules, r.local_date, r.metadata?.items as ItemLike));
  const badIds = new Set(bad.map((r) => r.id));
  const built = await rebuildPlan(ctx, reason, now);
  if (!built.ok) return built;
  const view = await loadPlanView(ctx, now);
  if (!view.ok || !("days" in view)) return { ok: false, error: "no_setup" };
  return {
    ok: true,
    replaced: bad.map((r) => ({ date: r.local_date, slot: r.meal_slot, was: r.title, edited: custom(r) })),
    keptEdits: planned.filter((r) => !badIds.has(r.id) && custom(r)).map((r) => ({ date: r.local_date, slot: r.meal_slot })),
    meals: view.days.map((d) => ({ date: d.date, slot: d.slot, meal: d.kind === "eat_out" ? d.title : d.items.map((i) => i.text).join(", "), status: d.status })),
    violations: view.days.filter((d) => d.status === "planned" && d.kind !== "eat_out" && !itemsAllowedOn(rules, d.date, d.items)).length,
    proteinGap: view.gapsLine ?? null,
  };
}

/**
 * Starts a temporary diet and/or foods to avoid until a date ("veg only for 20 days", "no sweets
 * this week"); with neither, ends the one running.
 */
export async function setDietPeriod(ctx: ActionContext, input: { diet: PeriodDiet | null; avoid?: string[]; until?: string }, now = new Date()): Promise<DietPeriodResult> {
  const today = localDateKey(now, ctx.timezone);
  const row = await loadDietPrefs(ctx.userProfileId);
  if (!row.saved) return { ok: false, error: "no_setup" };
  const avoid = cleanAvoidList(input.avoid ?? []).slice(0, 20);
  const starting = !!input.diet || avoid.length > 0;
  if (starting && (!input.until || input.until < today)) return { ok: false, error: "bad_dates" };
  const override: DietOverride | null = starting ? { ...(input.diet ? { diet: input.diet } : {}), ...(avoid.length ? { avoid } : {}), from: today, until: input.until! } : null;
  await saveDietPrefs(ctx.userProfileId, { ...row.prefs, dietOverride: override });
  const r = await replanAfter(ctx, override ? "diet_period" : "diet_period_end", now);
  if (!r.ok) return r;
  return { ...r, diet: override?.diet ?? null, avoid, from: override?.from ?? null, until: override?.until ?? null };
}

export type AvoidResult = ({ ok: true; avoid: string[] } & ReplanReport) | { ok: false; error: "no_setup" | "no_targets" | "nothing_to_change" };

/** Adds foods to (or takes them off) the lasting avoid list in their food settings, then re-plans. */
export async function changeAvoidList(ctx: ActionContext, input: { add?: string[]; remove?: string[] }, now = new Date()): Promise<AvoidResult> {
  const food = await loadFoodPrefs(ctx.userProfileId);
  const drop = new Set((input.remove ?? []).map((x) => x.trim().toLowerCase()));
  const next = cleanAvoidList([...food.foodAvoid.filter((x) => !drop.has(x.toLowerCase())), ...(input.add ?? [])]).slice(0, 40);
  if (next.join("|") === food.foodAvoid.join("|")) return { ok: false, error: "nothing_to_change" };
  await saveFoodAvoid(ctx.userProfileId, next);
  const r = await replanAfter(ctx, "food_prefs_changed", now);
  return r.ok ? { ...r, avoid: next } : r;
}

// ---------- swap feedback ----------

/**
 * Why they swapped a planned meal. Each reason means something different, and only the first
 * two are remembered:
 * - dont_cook: "We don't cook this" — that dish (not its ingredients) never comes back.
 * - too_much_effort: that dish is ranked down from now on; quicker meals come first.
 * - dislike_combo: that combination is hidden; its foods stay available in other meals.
 * - unavailable_today / want_different: skipped for that date only, nothing is remembered.
 */
export const FEEDBACK_REASONS = ["dont_cook", "too_much_effort", "dislike_combo", "unavailable_today", "want_different"] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

/** The dish a meal is built around: its biggest item that isn't the roti or rice. */
export function mainDishOf(items: Array<{ key: string | null; kcal: number }>): string | null {
  const cat = catalog();
  const notBase = items.filter((i) => i.key && !["bread", "grain"].includes(cat.byKey.get(i.key)?.category ?? "") && i.key !== "white rice cooked");
  return [...(notBase.length ? notBase : items)].sort((a, b) => b.kcal - a.kcal)[0]?.key ?? null;
}

export async function mealFeedback(
  ctx: ActionContext,
  date: string,
  slot: PlanSlot,
  reason: FeedbackReason,
  now = new Date(),
): Promise<{ ok: true; remembered: string | null } | { ok: false; error: string }> {
  const today = localDateKey(now, ctx.timezone);
  const { data, error } = await supabase
    .from("meal_plan_entries")
    .select("id, metadata")
    .eq("user_profile_id", ctx.userProfileId)
    .eq("local_date", date)
    .eq("meal_slot", slot)
    .eq("source", "plan")
    .eq("status", "planned")
    .limit(1);
  if (error) throw new Error(error.message);
  const entry = (data ?? [])[0] as { id: string; metadata: Record<string, unknown> | null } | undefined;
  if (!entry) return { ok: false, error: "meal_not_planned" };
  const optionId = (entry.metadata?.option_id as string | null) ?? null;
  const items = (entry.metadata?.items as Array<{ key: string | null; kcal: number }> | undefined) ?? [];
  const row = await loadDietPrefs(ctx.userProfileId);
  const prefs = { ...row.prefs, habits: { ...row.prefs.habits } };
  let remembered: string | null = null;
  if (reason === "dont_cook" || reason === "too_much_effort") {
    const dish = mainDishOf(items);
    if (dish) {
      const field = reason === "dont_cook" ? "neverCook" : "tooMuchEffort";
      prefs.habits[field] = [...new Set([...(prefs.habits[field] ?? []), dish])].slice(-100);
      remembered = dish;
    }
  } else if (reason === "dislike_combo") {
    if (optionId) await markOption(ctx.userProfileId, optionId, "hide");
  }
  if ((reason === "unavailable_today" || reason === "want_different") && optionId) {
    // Old dates drop off, so a skip never outlives its day.
    prefs.unavailable = [...prefs.unavailable.filter((u) => u.date >= today), { date, optionId }].slice(-60);
  }
  await saveDietPrefs(ctx.userProfileId, prefs);
  if (remembered) {
    // A dish they don't cook (or find too much work) leaves every option: rebuild, keeping eaten meals.
    // This meal goes too, even if they had edited it: it's the one they just said no to.
    await supabase.from("meal_plan_entries").delete().eq("id", entry.id).eq("status", "planned");
    const r = await rebuildPlan(ctx, "food_prefs_changed", now);
    if (!r.ok) return r;
  } else {
    // Re-pick just this meal: the next view picks a different option for it.
    await supabase.from("meal_plan_entries").delete().eq("id", entry.id).eq("status", "planned");
  }
  return { ok: true, remembered };
}

// ---------- protein the plan can't reach ----------

/**
 * The plan's protein gap as one line, for every way a plan gets built (setup, fresh plan, goal
 * change, food settings, chat): null when the plan reaches the target or there's no plan.
 */
export async function planGapLine(ctx: ActionContext, now = new Date()): Promise<string | null> {
  const view = await loadPlanView(ctx, now).catch(() => null);
  return view && view.ok && "days" in view ? view.gapsLine ?? null : null;
}

/** "Keep this plan": the non-protein gaps it has now are accepted until their food rules change. */
export async function acceptPlanGaps(ctx: ActionContext, now = new Date()): Promise<{ ok: true; accepted: GapKey[] } | { ok: false; error: string }> {
  const view = await loadPlanView(ctx, now);
  if (!view.ok || !("days" in view)) return { ok: false, error: "no_plan" };
  const keys = (view.planGaps ?? []).filter((g) => g.key !== "proteinG").map((g) => g.key);
  if (!keys.length) return { ok: false, error: "no_gap" };
  const today = localDateKey(now, ctx.timezone);
  const prefs = await loadDietPrefs(ctx.userProfileId);
  const rules = await rulesFor(ctx.userProfileId, prefs.prefs, today);
  const key = rulesKey(rules, prefs.prefs);
  const before = prefs.prefs.planGapsOk?.rulesKey === key ? prefs.prefs.planGapsOk.keys : [];
  await saveDietPrefs(ctx.userProfileId, { ...prefs.prefs, planGapsOk: { keys: [...new Set([...before, ...keys])], rulesKey: key, at: now.toISOString() } });
  return { ok: true, accepted: keys };
}

async function restoreProteinTarget(ctx: ActionContext, prefs: DietPrefs, current: number | null): Promise<void> {
  const g = prefs.proteinGap;
  if (!g) return;
  // Only when the target is still the one the gap set: a target they changed since stays theirs.
  if (current === acceptedTarget(g.plannedG)) await updateDailyTargets(ctx.userProfileId, { proteinTarget: g.originalTargetG });
  await saveDietPrefs(ctx.userProfileId, { ...prefs, proteinGap: null });
}

/** The protein supplement offered for a gap: whey if their diet allows it, else the strongest one that fits. */
function gapSupplement(allows: (name: string) => boolean): string | null {
  const choices = supplementChoices().filter((c) => c.proteinG >= 15 && allows(c.name));
  return (choices.find((c) => /whey/i.test(c.name)) ?? [...choices].sort((a, b) => b.proteinG - a.proteinG)[0])?.name ?? null;
}

/**
 * Their answer to "the plan reaches X g of Y g": accept lowers the protein target to what the
 * plan reaches until their rules change; supplement adds a serving of a protein supplement and
 * rebuilds. Loosening a rule happens in plan setup, so nothing is stored for it.
 */
export async function answerProteinGap(ctx: ActionContext, choice: GapChoice, now = new Date()): Promise<{ ok: true; gap: ProteinGap | null; proteinTarget?: number; supplement?: string } | { ok: false; error: string }> {
  const view = await loadPlanView(ctx, now);
  if (!view.ok || !("days" in view) || !view.plan) return { ok: false, error: "no_plan" };
  const gap = view.proteinGap;
  if (!gap) return { ok: false, error: "no_gap" };
  if (choice === "loosen") return { ok: true, gap };
  const today = localDateKey(now, ctx.timezone);
  const prefs = await loadDietPrefs(ctx.userProfileId);
  const rules = await rulesFor(ctx.userProfileId, prefs.prefs, today);
  const at = now.toISOString();
  if (choice === "accept") {
    const target = acceptedTarget(gap.plannedG);
    await saveDietPrefs(ctx.userProfileId, { ...prefs.prefs, proteinGap: { choice, plannedG: gap.plannedG, originalTargetG: gap.targetG, rulesKey: rulesKey(rules, prefs.prefs), at } });
    const saved = await updateDailyTargets(ctx.userProfileId, { proteinTarget: target });
    if (!saved.ok) return { ok: false, error: "target_not_saved" };
    const after = await loadPlanView(ctx, now);
    return { ok: true, gap: after.ok && "days" in after ? after.proteinGap ?? null : null, proteinTarget: target };
  }
  const ok = checkOn(rules, today);
  const name = gapSupplement((n) => ok({ key: null, name: n }));
  if (!name) return { ok: false, error: "no_supplement_fits" };
  const has = prefs.prefs.supplements.find((x) => x.name.toLowerCase() === name.toLowerCase());
  const supplements = has
    ? prefs.prefs.supplements.map((x) => (x === has ? { ...x, servings: Math.min(4, x.servings + 1) } : x))
    : [...prefs.prefs.supplements, { name, servings: 1, slot: null }];
  const next = { ...prefs.prefs, supplements };
  await saveDietPrefs(ctx.userProfileId, { ...next, proteinGap: { choice, plannedG: gap.plannedG, originalTargetG: gap.targetG, rulesKey: rulesKey(rules, next), at } });
  const built = await rebuildPlan(ctx, "supplements", now);
  if (!built.ok) return built;
  const after = await loadPlanView(ctx, now);
  return { ok: true, gap: after.ok && "days" in after ? after.proteinGap ?? null : null, supplement: name };
}
