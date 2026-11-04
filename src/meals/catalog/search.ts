/**
 * Food search and suggestions over the catalog.
 *
 * Ranking: how well the text matches (name before alias, whole word before part), then how
 * popular the food is (data/ranking.ts, blended with real log counts when given), then the
 * shorter name. Results can be grouped by cuisine for display, with groups in the order of
 * their best result. An empty query lists the most popular foods, which is what a picker
 * shows before the person types.
 */
import { foodKeyFor } from "../foodParse.js";
import { catalog, type Catalog, type CatalogEntry } from "./index.js";
import type { Cuisine, MealType } from "./types.js";

export type SearchDiet = "veg" | "egg" | "nonveg" | "vegan" | "jain";

export type SearchOptions = {
  limit?: number;
  /** Only foods this diet can eat ("egg" = vegetarian plus egg). */
  diet?: SearchDiet;
  /** Only foods usually eaten at this meal. */
  meal?: MealType;
  cuisine?: Cuisine;
  /** Leave out cooking ingredients (raw dal, flour, oil) that people rarely log on their own. */
  eatenOnly?: boolean;
  /** Real log counts by catalog key (last 30–90 days), blended into popularity. */
  usage?: ReadonlyMap<string, number>;
};

export type SearchHit = { entry: CatalogEntry; score: number; matched: string };

const DIET_OK: Record<SearchDiet, (e: CatalogEntry) => boolean> = {
  vegan: (e) => e.diet === "vegan",
  veg: (e) => e.diet === "veg" || e.diet === "vegan",
  jain: (e) => e.jain,
  egg: (e) => e.diet !== "nonveg",
  nonveg: () => true,
};

/**
 * 0 when the text doesn't match; higher for closer matches. A name match always beats the same
 * kind of alias match ("rice" finds curd rice before idli, whose alias is "rice idli").
 */
function matchScore(q: string, text: string, isName: boolean): number {
  if (!q) return 0;
  const [exact, prefix, word, words, part] = isName ? [105, 85, 70, 60, 40] : [95, 60, 45, 40, 20];
  if (text === q) return exact;
  if (text.startsWith(q)) return prefix;
  const ws = text.split(" ");
  if (ws.some((w) => w.startsWith(q))) return word;
  const qWords = q.split(" ");
  if (qWords.length > 1 && qWords.every((qw) => ws.some((w) => w.startsWith(qw)))) return words;
  if (text.includes(q)) return part;
  return 0;
}

/** Popularity on a 0–5 scale: the judged prior, nudged up by real logs (log scale, capped). */
export function popularityScore(e: CatalogEntry, usage?: ReadonlyMap<string, number>): number {
  const logs = usage?.get(e.key) ?? 0;
  return Math.min(5, e.popularity + Math.log10(1 + logs));
}

export function searchCatalog(query: string, opts: SearchOptions = {}, cat: Catalog = catalog()): SearchHit[] {
  const q = foodKeyFor(query);
  const hits: SearchHit[] = [];
  for (const e of cat.entries) {
    if (opts.diet && !DIET_OK[opts.diet](e)) continue;
    if (opts.meal && !e.meals.includes(opts.meal)) continue;
    if (opts.cuisine && e.cuisine !== opts.cuisine) continue;
    if ((opts.eatenOnly ?? true) && !e.meals.length && e.popularity < 3) continue;
    let best = q ? matchScore(q, e.key, true) : 0;
    let matched = e.key;
    for (const a of q ? e.aliases : []) {
      const s = matchScore(q, a, false);
      if (s > best) [best, matched] = [s, a];
    }
    if (q && !best) continue;
    // Popularity is worth up to 25 points: it reorders close matches but never lifts a part-word
    // match above a whole-word one.
    hits.push({ entry: e, score: best + 5 * popularityScore(e, opts.usage), matched });
  }
  hits.sort((a, b) => b.score - a.score || a.entry.name.length - b.entry.name.length || a.entry.name.localeCompare(b.entry.name));
  return hits.slice(0, opts.limit ?? 20);
}

export type CuisineGroup = { cuisine: Cuisine; hits: SearchHit[] };

/** Groups hits by cuisine, keeping each group's order; groups follow their best hit. */
export function groupByCuisine(hits: SearchHit[]): CuisineGroup[] {
  const groups = new Map<Cuisine, SearchHit[]>();
  for (const h of hits) {
    const g = groups.get(h.entry.cuisine);
    if (g) g.push(h);
    else groups.set(h.entry.cuisine, [h]);
  }
  return [...groups].map(([cuisine, hits]) => ({ cuisine, hits }));
}

export const CUISINE_LABEL: Record<Cuisine, string> = {
  everyday: "Everyday",
  north_indian: "North Indian",
  south_indian: "South Indian",
  west_indian: "Gujarati & Maharashtrian",
  east_indian: "Bengali & East",
  mughlai: "Mughlai & tandoor",
  indo_chinese: "Indo-Chinese",
  street_food: "Street food & chaat",
  western: "Western & cafe",
  packaged: "Packaged",
};
