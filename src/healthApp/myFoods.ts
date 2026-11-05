/**
 * "My foods": what a person found with "Can't find it? Search" (a web lookup) or typed in from a
 * label, saved when they approve it so both food searches offer it next time.
 *
 * Guardrails: the lookup text already passed checkFoodQuery (food names only) before anything was
 * paid for, and its results were cleaned (cleanLookupItems). Those results are stored unapproved
 * under a lookup id; approving can only flip rows that lookup returned, so the client can't save
 * arbitrary names or numbers as "web". Typed-in foods go through the same name check and limits.
 * Rows are private to the person: nothing here reaches the shared food tables.
 */
import { foodKeyFor } from "../meals/foodParse.js";
import { logger } from "../logger.js";
import { supabase } from "../tools/clients.js";
import { checkFoodQuery, cleanLookupItems } from "./foodLookup.js";
import type { MealItem } from "./meals.js";

const TABLE = "health_my_foods";
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SAVED = 300;

export type MyFood = { id: string; name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; source: "web" | "own" };

type Row = MyFood & { food_key: string };

/** A clean, food-only line, or null. Pure. */
export function cleanOwnFood(item: Partial<MealItem>): MealItem | null {
  const name = typeof item.name === "string" ? item.name : "";
  const check = checkFoodQuery(name);
  if (!check.ok) return null;
  const [clean] = cleanLookupItems([{ ...item, name: check.text } as MealItem]);
  return clean ?? null;
}

/** Saved foods that match a search box: every typed word in the name; the newest first for an empty box. Pure. */
export function matchMyFoods(rows: Row[], query: string, limit: number): Row[] {
  const words = foodKeyFor(query).split(" ").filter(Boolean);
  if (!words.length) return rows.slice(0, Math.min(limit, 5));
  return rows.filter((r) => words.every((w) => r.food_key.includes(w))).slice(0, limit);
}

/** Stores a lookup's results, unapproved, and returns the id the approve call names. Soft: null on failure. */
export async function recordLookup(userProfileId: string, items: MealItem[]): Promise<string | null> {
  if (!items.length) return null;
  const lookupId = crypto.randomUUID();
  try {
    await supabase.from(TABLE).delete().eq("user_profile_id", userProfileId).eq("approved", false).lt("created_at", new Date(Date.now() - PENDING_TTL_MS).toISOString());
    const { error } = await supabase.from(TABLE).insert(items.map((i) => ({ ...rowOf(userProfileId, i, "web"), lookup_id: lookupId })));
    if (error) throw new Error(error.message);
    return lookupId;
  } catch (err) {
    logger.warn({ err: String(err) }, "my foods: lookup not stored");
    return null;
  }
}

/** Saves what the person approved from one lookup. Returns how many foods are now saved. */
export async function approveLookup(userProfileId: string, lookupId: string): Promise<number> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, food_key")
    .eq("user_profile_id", userProfileId)
    .eq("lookup_id", lookupId)
    .eq("approved", false);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ id: string; food_key: string }>;
  if (!rows.length) return 0;
  await replaceSameName(userProfileId, rows.map((r) => r.food_key));
  const upd = await supabase.from(TABLE).update({ approved: true, approved_at: new Date().toISOString() }).in("id", rows.map((r) => r.id)).eq("user_profile_id", userProfileId);
  if (upd.error) throw new Error(upd.error.message);
  await trim(userProfileId);
  return rows.length;
}

/** Saves a food typed in from a label. Null when it isn't a plain food name with sane numbers. */
export async function saveOwnFood(userProfileId: string, item: Partial<MealItem>): Promise<MealItem | null> {
  const clean = cleanOwnFood(item);
  if (!clean) return null;
  await replaceSameName(userProfileId, [foodKeyFor(clean.name)]);
  const { error } = await supabase.from(TABLE).insert({ ...rowOf(userProfileId, clean, "own"), approved: true, approved_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  await trim(userProfileId);
  return clean;
}

/** The person's saved foods matching a search. Soft: [] on failure (the catalog still answers). */
export async function searchMyFoods(userProfileId: string, query: string, limit = 5): Promise<MyFood[]> {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("id, name, food_key, calories, protein_g, carbs_g, fat_g, source")
      .eq("user_profile_id", userProfileId)
      .eq("approved", true)
      .order("approved_at", { ascending: false })
      .limit(MAX_SAVED);
    if (error) throw new Error(error.message);
    const rows = ((data ?? []) as Row[]).map((r) => ({ ...r, calories: Number(r.calories), protein_g: Number(r.protein_g), carbs_g: Number(r.carbs_g), fat_g: Number(r.fat_g) }));
    return matchMyFoods(rows, query, limit).map(({ food_key: _k, ...f }) => f);
  } catch (err) {
    logger.warn({ err: String(err) }, "my foods: search failed");
    return [];
  }
}

function rowOf(userProfileId: string, i: MealItem, source: "web" | "own") {
  return {
    user_profile_id: userProfileId,
    name: i.name,
    food_key: foodKeyFor(i.name),
    calories: Math.round(i.calories),
    protein_g: i.protein_g,
    carbs_g: i.carbs_g,
    fat_g: i.fat_g,
    source,
  };
}

/** The newest save of a name wins: an earlier saved food with the same name is replaced. */
async function replaceSameName(userProfileId: string, keys: string[]) {
  const { error } = await supabase.from(TABLE).delete().eq("user_profile_id", userProfileId).eq("approved", true).in("food_key", keys);
  if (error) logger.warn({ error: error.message }, "my foods: replace failed");
}

/** Keeps the newest MAX_SAVED saved foods. */
async function trim(userProfileId: string) {
  const { data } = await supabase.from(TABLE).select("id").eq("user_profile_id", userProfileId).eq("approved", true).order("approved_at", { ascending: false }).range(MAX_SAVED, MAX_SAVED + 50);
  const old = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (old.length) await supabase.from(TABLE).delete().in("id", old);
}
