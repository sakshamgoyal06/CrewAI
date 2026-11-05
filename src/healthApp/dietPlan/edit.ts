/**
 * Editing one planned meal: change portions, remove items, add foods from the catalog. The food
 * search and every added food go through the same restriction check as the planner
 * (compose.ts `restrictionCheck`), so an edit can't bring back a food the person avoids.
 */
import { z } from "zod";

import { catalog, servingId, servingLabel, type Catalog, type CatalogEntry } from "../../meals/catalog/index.js";
import { searchCatalog } from "../../meals/catalog/search.js";
import { supabase } from "../../tools/clients.js";
import type { ActionContext } from "../actions.js";
import { loadFoodPrefs } from "../onboarding.js";
import { setQty } from "./adjust.js";
import { itemFor, nameRestrictionCheck, restrictionCheck, sumTotals, titleOf, type PersonDiet, type PlanItem, type Totals } from "./compose.js";
import { localDateKey } from "../../nutrition/localDate.js";
import { effectiveDiet } from "./dietPeriod.js";
import { loadDietPrefs } from "./store.js";
import type { PlanSlot } from "./targets.js";

export const MAX_MEAL_ITEMS = 12;

const qty = z.number().gt(0).max(20);
const customFood = z.object({
  name: z.string().trim().min(2).max(80).regex(/^[\p{L}\p{M}\p{N}\s.,'’&%/()+×½¼¾-]+$/u),
  kcal: z.number().gt(0).max(3000),
  proteinG: z.number().min(0).max(300),
  carbsG: z.number().min(0).max(500),
  fatG: z.number().min(0).max(300),
});

export const editInput = z.object({
  /** The meal's items in order: a planned item kept at a portion, or a catalog serving added. */
  items: z
    .array(
      z.union([
        z.object({ keep: z.number().int().min(0).max(40), qty }),
        z.object({ servingId: z.string().min(3).max(120), qty }),
        /** A food the catalog doesn't have, with its own numbers (the "Can't find it? Search" web lookup). */
        z.object({ custom: customFood, qty }),
      ]),
    )
    .min(1)
    .max(MAX_MEAL_ITEMS),
});
export type EditInput = z.infer<typeof editInput>;

/** "dal tadka:bowl" → the catalog food and serving; null when either is unknown. */
export function servingFor(id: string, cat: Catalog = catalog()) {
  const key = id.split(":")[0]!;
  const e = cat.byKey.get(key);
  const s = e?.servings.find((x) => servingId(e.key, x) === id);
  return e && s ? { e, s } : null;
}

export type EditResult = { ok: true; items: PlanItem[]; totals: Totals } | { ok: false; error: "unknown_food" | "not_allowed" | "unknown_item"; name?: string };

/**
 * The meal after an edit. Kept items are re-portioned (catalog items exactly, usual-meal items
 * scaled); added foods must pass the person's restrictions. Pure.
 */
export function applyEdit(
  current: PlanItem[],
  input: EditInput,
  allows: (e: CatalogEntry) => boolean,
  cat: Catalog = catalog(),
  allowsName: (name: string) => boolean = () => true,
): EditResult {
  const out: PlanItem[] = [];
  for (const x of input.items) {
    if ("custom" in x) {
      const c = x.custom;
      const name = c.name.replace(/\s+/g, " ").trim();
      if (!allowsName(name)) return { ok: false, error: "not_allowed", name };
      const r1 = (n: number) => Math.round(n * x.qty * 10) / 10;
      out.push({
        key: null,
        name,
        servingId: null,
        qty: x.qty,
        text: x.qty === 1 ? name : `${x.qty} × ${name}`,
        grams: null,
        kcal: Math.round(c.kcal * x.qty),
        proteinG: r1(c.proteinG),
        carbsG: r1(c.carbsG),
        fatG: r1(c.fatG),
        fiberG: 0,
      });
      continue;
    }
    if ("keep" in x) {
      const base = current[x.keep];
      if (!base) return { ok: false, error: "unknown_item" };
      out.push(x.qty === base.qty ? base : setQty(base, x.qty, cat));
      continue;
    }
    const found = servingFor(x.servingId, cat);
    if (!found) return { ok: false, error: "unknown_food" };
    if (!allows(found.e)) return { ok: false, error: "not_allowed", name: found.e.name };
    out.push(itemFor(found.e, found.s, x.qty));
  }
  return { ok: true, items: out, totals: sumTotals(out) };
}

/** What the person's food settings allow, read fresh: diet, foods to avoid, diet note and plan restrictions. */
export async function restrictionsFor(userProfileId: string, today: string): Promise<((e: CatalogEntry) => boolean) & { byName: (name: string) => boolean }> {
  const [food, prefs] = await Promise.all([loadFoodPrefs(userProfileId), loadDietPrefs(userProfileId)]);
  const diet = effectiveDiet(food.diet as PersonDiet, prefs.prefs.dietOverride, today);
  const byName = nameRestrictionCheck({ diet, avoid: food.foodAvoid });
  return Object.assign(restrictionCheck({
    diet,
    avoid: food.foodAvoid,
    dietNote: [food.dietNote ?? "", ...prefs.prefs.restrictions].filter(Boolean),
  }), { byName });
}

export type FoodHit = {
  key: string;
  name: string;
  servings: Array<{ id: string; label: string; default: boolean; item: PlanItem }>;
};

const MEAL_TYPE = { breakfast: "breakfast", lunch: "lunch", snack: "snack", dinner: "dinner" } as const;

/**
 * Foods to add to a meal. Typed text searches the whole catalog; an empty box suggests what's
 * usually eaten at this meal. Anything the person's restrictions rule out is left out. Pure.
 */
export function searchMealFoods(q: string, slot: PlanSlot, allows: (e: CatalogEntry) => boolean, limit = 12, cat: Catalog = catalog()): FoodHit[] {
  const typed = q.trim().length > 0;
  const hits = searchCatalog(q, { limit: 80, ...(typed ? {} : { meal: MEAL_TYPE[slot] }) }, cat);
  return hits
    .filter((h) => allows(h.entry))
    .slice(0, limit)
    .map(({ entry: e }) => ({
      key: e.key,
      name: e.name,
      servings: e.servings.slice(0, 4).map((s) => ({ id: servingId(e.key, s), label: servingLabel(s), default: !!s.default, item: itemFor(e, s, 1) })),
    }));
}

/** Saves an edited planned meal (not yet eaten) in place; the plan keeps it for that day. */
export async function editPick(ctx: ActionContext, date: string, slot: PlanSlot, input: EditInput): Promise<EditResult | { ok: false; error: "meal_not_planned" | "eat_out" }> {
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
  const meta = entry.metadata ?? {};
  if (meta.kind === "eat_out") return { ok: false, error: "eat_out" };
  const allows = await restrictionsFor(ctx.userProfileId, localDateKey(ctx.now ?? new Date(), ctx.timezone));
  const r = applyEdit((meta.items as PlanItem[] | undefined) ?? [], input, allows, catalog(), allows.byName);
  if (!r.ok) return r;
  const { error: e2 } = await supabase
    .from("meal_plan_entries")
    .update({
      title: titleOf(r.items),
      estimated_calories: r.totals.kcal,
      estimated_protein_g: r.totals.proteinG,
      estimated_carbs_g: r.totals.carbsG,
      estimated_fat_g: r.totals.fatG,
      metadata: { ...meta, items: r.items, totals: r.totals, edited: true },
      updated_at: new Date().toISOString(),
    })
    .eq("id", entry.id)
    .eq("status", "planned");
  if (e2) throw new Error(e2.message);
  return r;
}
