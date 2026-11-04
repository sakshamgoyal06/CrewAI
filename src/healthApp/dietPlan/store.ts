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
import type { MealOption, PersonDiet } from "./compose.js";
import { pickDays, PLAN_DAYS, type DayPick, type PriorPick } from "./pick.js";
import { defaultPrefs, dietPrefsInput, type DietPrefs, type DietPrefsInput } from "./prefs.js";
import { reviewEnabled, reviewPlan } from "./review.js";
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
  const prefs = dietPrefsInput.parse(input);
  const { error } = await supabase
    .from("health_diet_preferences")
    .upsert({ user_profile_id: userProfileId, prefs, updated_at: new Date().toISOString() }, { onConflict: "user_profile_id" });
  if (error) throw new Error(error.message);
  return prefs;
}

export const OPTION_ACTIONS = ["pin", "unpin", "like", "unlike", "hide", "unhide"] as const;
export type OptionAction = (typeof OPTION_ACTIONS)[number];

/** Pin, like or hide an option. Marks are by option id, so they carry over to later plan versions. */
export async function markOption(userProfileId: string, optionId: string, action: OptionAction): Promise<PrefsRow> {
  const row = await loadDietPrefs(userProfileId);
  const col = action.includes("pin") ? "pinned" : action.includes("like") ? "liked" : "hidden";
  const add = !action.startsWith("un");
  const set = new Set(row[col]);
  if (add) set.add(optionId);
  else set.delete(optionId);
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
    (options[r.slot] ??= []).push({
      id: r.id,
      slot: r.slot,
      title: r.title,
      items: r.items,
      totals: r.totals,
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
      totals: o.totals,
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
    diet: food.diet as PersonDiet,
    avoid: food.foodAvoid,
    usual,
    hidden: prefs.hidden,
    review: reviewEnabled() ? reviewPlan : undefined,
  });
  const previous = await loadActivePlan(ctx.userProfileId);
  const plan = await savePlan(ctx.userProfileId, draft, reason, previous);
  // Today keeps its picks (the same-day rebalance handles today); later days are picked again.
  await dropFuturePicks(ctx.userProfileId, addDays(today, 1));
  logger.info({ userProfileId: ctx.userProfileId, version: plan.version, reason, reviewed: !!draft.review }, "diet plan built");
  return { ok: true, plan };
}

// ---------- the 3-day picks ----------

type EntryRow = { id: string; local_date: string; meal_slot: PlanSlot; title: string; status: string; metadata: Record<string, unknown> | null; estimated_calories: number | null };

/** Removes planned (not yet eaten) picks from `fromDate` on, or every future pick of one option. */
async function dropFuturePicks(userProfileId: string, fromDate: string | null, opts: { optionId?: string } = {}): Promise<void> {
  let q = supabase.from("meal_plan_entries").delete().eq("user_profile_id", userProfileId).eq("source", "plan").eq("status", "planned");
  if (fromDate) q = q.gte("local_date", fromDate);
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
};

/** Today and the next two days, picking and saving any meal not yet planned. */
export async function ensureDays(ctx: ActionContext, plan: ActivePlan, prefs: PrefsRow, today: string): Promise<PlannedMeal[]> {
  const to = addDays(today, PLAN_DAYS - 1);
  const rows = await loadEntries(ctx.userProfileId, addDays(today, -2), to);
  const existing: PriorPick[] = rows.map((r) => ({ date: r.local_date, slot: r.meal_slot, optionId: (r.metadata?.option_id as string | null) ?? null }));
  const picks = pickDays({ start: today, budgets: plan.budgets, options: plan.options, prefs: prefs.prefs, pinned: prefs.pinned, existing });
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
    return { ...p, totals, ...saved, entryId: r?.id ?? null, status: r?.status ?? "planned", items, ...(eatenItems ? { eatenItems } : {}), ...(loggedSessionId ? { loggedSessionId } : {}) };
  });
}

/** Swaps one planned meal for another option of the same meal. */
export async function swapPick(ctx: ActionContext, date: string, slot: PlanSlot, optionId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const plan = await loadActivePlan(ctx.userProfileId);
  const option = plan?.options[slot]?.find((o) => o.id === optionId);
  if (!plan || !option) return { ok: false, error: "option_not_found" };
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
  setup: boolean;
  prefs: DietPrefs;
  marks: { pinned: string[]; liked: string[]; hidden: string[] };
  plan: Omit<ActivePlan, "review"> | null;
  days: PlannedMeal[];
  reviewOn: boolean;
  /** No calorie or protein target yet: the plan has nothing to split, so the tab asks for them first. */
  needsTargets: boolean;
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
  const base = { prefs: prefs.prefs, marks: { pinned: prefs.pinned, liked: prefs.liked, hidden: prefs.hidden }, reviewOn: reviewEnabled(), needsTargets };
  if (!prefs.saved || needsTargets) return { ok: true, setup: prefs.saved, plan: null, days: [], ...base };
  let plan = await loadActivePlan(ctx.userProfileId);
  const stale = plan && (plan.targets.calories !== Math.round(t.calorieTarget ?? 0) || plan.targets.proteinG !== Math.round(t.proteinTarget ?? 0));
  if (!plan || stale) {
    const r = await rebuildPlan(ctx, plan ? "target_change" : "setup", now);
    if (!r.ok) return r;
    plan = r.plan;
  }
  const days = await ensureDays(ctx, plan, prefs, today);
  const { review: _r, ...rest } = plan;
  return { ok: true, setup: true, plan: rest, days, ...base };
}
