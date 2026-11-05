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
import { getBodyCheckins } from "../bodyStore.js";
import { FREQUENT_WINDOW_DAYS, loadLoggedSessions, rankUsualMeals } from "../frequentMeals.js";
import { loadFoodPrefs } from "../onboarding.js";
import { loadHealthProfile } from "../snapshot.js";
import { buildPlanDraft, type PlanDraft } from "./build.js";
import { activeOverride, effectiveDiet, type DietOverride, type PeriodDiet } from "./dietPeriod.js";
import { restrictionCheck, type MealOption, type PersonDiet } from "./compose.js";
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
  const missing = ["dietOverride", "habits", "unavailable"].filter((k) => !(k in raw));
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

type OptionMeta = { novelty: boolean; prep: MealOption["prep"] | null; proteinGroup: string | null };

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
      totals: { ...o.totals, meta: { novelty: !!o.novelty, prep: o.prep ?? null, proteinGroup: o.proteinGroup ?? null } satisfies OptionMeta },
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
    diet: effectiveDiet(food.diet as PersonDiet, prefs.prefs.dietOverride, today),
    avoid: food.foodAvoid,
    dietNote: food.dietNote,
    usual,
    hidden: prefs.hidden,
    review: reviewEnabled() ? reviewPlan : undefined,
  });
  const previous = await loadActivePlan(ctx.userProfileId);
  const plan = await savePlan(ctx.userProfileId, draft, reason, previous);
  // Today keeps its picks (the same-day rebalance handles today); later days are picked again.
  // After a diet or food-list change, or "Make me a fresh plan", today's meals not yet eaten go too, so nothing they ruled out stays.
  const fresh = reason === "food_prefs_changed" || reason === "rebuild";
  await dropFuturePicks(ctx.userProfileId, fresh ? today : addDays(today, 1), { keepCustom: !fresh });
  logger.info({ userProfileId: ctx.userProfileId, version: plan.version, reason, reviewed: !!draft.review }, "diet plan built");
  return { ok: true, plan };
}

/** What the person's food settings allow right now (diet, avoid list, diet note, plan restrictions). */
async function allowsFor(userProfileId: string, prefs: DietPrefs, today: string) {
  const food = await loadFoodPrefs(userProfileId);
  return restrictionCheck({ diet: effectiveDiet(food.diet as PersonDiet, prefs.dietOverride, today), avoid: food.foodAvoid, dietNote: [food.dietNote ?? "", ...prefs.restrictions].filter(Boolean) });
}

/** True when every catalog food in the items passes. Usual-meal items outside the catalog can't be checked here. */
function itemsAllowed(items: Array<{ key: string | null }> | undefined, allows: ReturnType<typeof restrictionCheck>): boolean {
  const cat = catalog();
  return (items ?? []).every((i) => {
    const e = i.key ? cat.byKey.get(i.key) : undefined;
    return !e || allows(e);
  });
}

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
    .in("status", ["planned", "logged", "partial"]);
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
  const allows = await allowsFor(ctx.userProfileId, prefs.prefs, today);
  const stale = rows.filter((r) => r.status === "planned" && !itemsAllowed(r.metadata?.items as Array<{ key: string | null }> | undefined, allows));
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
  const picks = pickDays({ start: today, budgets: plan.budgets, options: plan.options, prefs: prefs.prefs, pinned: prefs.pinned, existing, unavailable: prefs.prefs.unavailable });
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
  if (!itemsAllowed(option.items, await allowsFor(ctx.userProfileId, prefsNow.prefs, localDateKey(new Date(), ctx.timezone)))) return { ok: false, error: "not_allowed" };
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
};

/**
 * What the Meals tab shows. Builds the plan on first open after setup, and rebuilds it when the
 * profile's calorie or protein target has moved since (onboarding, review, intervention).
 */
export async function loadPlanView(ctx: ActionContext, now = new Date()): Promise<PlanView | { ok: false; error: string }> {
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
    plan = r.plan;
  }
  // Options saved in an older plan version may include food they have since ruled out: never show them.
  const allows = await allowsFor(ctx.userProfileId, prefs.prefs, today);
  plan = { ...plan, options: Object.fromEntries(Object.entries(plan.options).map(([slot, list]) => [slot, (list ?? []).filter((o) => itemsAllowed(o.items, allows))])) as typeof plan.options };
  const days = await ensureDays(ctx, plan, prefs, today);
  const { review: _r, ...rest } = plan;
  const dates = [...new Set(days.map((x) => x.date))];
  const logs = await loggedMealsOn(ctx.userProfileId, today);
  const times: Partial<Record<PlanSlot, string>> = {};
  for (const m of prefs.prefs.meals) if (m.time) times[m.slot as PlanSlot] = m.time;
  const lists = dates.map((date) => buildDayMeals({ date, today, plan: days.filter((x) => x.date === date).map(plannedLite), logs: date === today ? logs : [], times }));
  const accounts = dates.map((date, k) => accountDay({ date, targets: plan!.targets, meals: days.filter((x) => x.date === date), supplements: [], list: lists[k] }));
  return { ok: true, setup: true, plan: rest, days, accounts, lists, ...base };
}

// ---------- a temporary diet ----------

export type DietPeriodResult =
  | {
      ok: true;
      diet: PeriodDiet | null;
      from: string | null;
      until: string | null;
      /** Planned meals (today on) that broke the new diet and were picked again. */
      replaced: Array<{ date: string; slot: PlanSlot; was: string; edited: boolean }>;
      /** Meals they changed by hand that still fit, left as they are. */
      keptEdits: Array<{ date: string; slot: PlanSlot }>;
      /** The plan now, so the reply can say what is really there. */
      meals: Array<{ date: string; slot: PlanSlot; meal: string; status: string }>;
      /** Meals in the plan now that still break the diet: expected none. */
      violations: number;
    }
  | { ok: false; error: "no_setup" | "no_targets" | "bad_dates" };

/**
 * Starts (or, with diet null, ends) a temporary diet. The plan is rebuilt for it and every
 * planned meal from today that breaks it is picked again; meals they edited that still fit stay.
 * The result describes the plan as it is afterwards.
 */
export async function setDietPeriod(ctx: ActionContext, input: { diet: PeriodDiet | null; until?: string }, now = new Date()): Promise<DietPeriodResult> {
  const today = localDateKey(now, ctx.timezone);
  const row = await loadDietPrefs(ctx.userProfileId);
  if (!row.saved) return { ok: false, error: "no_setup" };
  const override: DietOverride | null = input.diet && input.until ? { diet: input.diet, from: today, until: input.until } : null;
  if (input.diet && (!input.until || input.until < today)) return { ok: false, error: "bad_dates" };
  const prefs = await saveDietPrefs(ctx.userProfileId, { ...row.prefs, dietOverride: override });
  // What breaks the new diet, before the rebuild picks it again.
  const allows = await allowsFor(ctx.userProfileId, prefs, today);
  const before = await loadEntries(ctx.userProfileId, today, addDays(today, PLAN_DAYS - 1));
  const planned = before.filter((r) => r.status === "planned");
  const bad = planned.filter((r) => !itemsAllowed(r.metadata?.items as Array<{ key: string | null }> | undefined, allows));
  const replaced = bad.map((r) => ({ date: r.local_date, slot: r.meal_slot, was: r.title, edited: r.metadata?.edited === true || r.metadata?.swapped === true }));
  const badIds = new Set(bad.map((r) => r.id));
  const keptEdits = planned.filter((r) => !badIds.has(r.id) && (r.metadata?.edited === true || r.metadata?.swapped === true)).map((r) => ({ date: r.local_date, slot: r.meal_slot }));
  const built = await rebuildPlan(ctx, override ? "diet_period" : "diet_period_end", now);
  if (!built.ok) return built;
  const view = await loadPlanView(ctx, now);
  if (!view.ok || !("days" in view)) return { ok: false, error: "no_setup" };
  const after = await allowsFor(ctx.userProfileId, prefs, today);
  const meals = view.days.map((d) => ({ date: d.date, slot: d.slot, meal: d.kind === "eat_out" ? d.title : d.items.map((i) => i.text).join(", "), status: d.status }));
  const violations = view.days.filter((d) => d.status === "planned" && d.kind !== "eat_out" && !itemsAllowed(d.items, after)).length;
  return { ok: true, diet: override?.diet ?? null, from: override?.from ?? null, until: override?.until ?? null, replaced, keptEdits, meals, violations };
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
    const r = await rebuildPlan(ctx, "food_prefs_changed", now);
    if (!r.ok) return r;
  } else {
    // Re-pick just this meal: the next view picks a different option for it.
    await supabase.from("meal_plan_entries").delete().eq("id", entry.id).eq("status", "planned");
  }
  return { ok: true, remembered };
}
