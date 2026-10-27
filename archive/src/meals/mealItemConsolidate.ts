import type { MealItemLine, MealNutritionEstimate } from "./types.js";

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Lowercase tokens; keep alphanumerics split by non-word chars. */
export function tokenizeFoodName(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function normFullName(name: string): string {
  return tokenizeFoodName(name).join(" ");
}

/** True if `small` matches a consecutive slice of `large` (strictly shorter). */
function isStrictConsecutiveSubsequence(small: string[], large: string[]): boolean {
  if (small.length === 0 || large.length === 0 || small.length >= large.length) {
    return false;
  }
  for (let i = 0; i <= large.length - small.length; i++) {
    let ok = true;
    for (let j = 0; j < small.length; j++) {
      if (large[i + j] !== small[j]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      return true;
    }
  }
  return false;
}

const LEGUME_TOKENS = new Set([
  "chhole",
  "chole",
  "chickpea",
  "chickpeas",
  "garbanzo",
  "garbanzos",
  "chana",
]);

/** Leafy / green bases — don't merge with non-green pulse dishes (e.g. palak chole vs chhole masala). */
const GREEN_DISH_MARKERS = new Set([
  "palak",
  "spinach",
  "saag",
  "methi",
  "lauki",
  "dudhi",
  "bhindi",
  "okra",
  "baingan",
  "brinjal",
  "aloo",
  "potato",
]);

function hasLegumeToken(name: string): boolean {
  for (const t of tokenizeFoodName(name)) {
    if (LEGUME_TOKENS.has(t)) {
      return true;
    }
  }
  return false;
}

function greenDishMarker(name: string): boolean {
  for (const t of tokenizeFoodName(name)) {
    if (GREEN_DISH_MARKERS.has(t)) {
      return true;
    }
  }
  return false;
}

function looksIndianSaucyDish(name: string): boolean {
  const t = new Set(tokenizeFoodName(name));
  return t.has("curry") || t.has("masala") || t.has("gravy") || t.has("chole");
}

/** Map chole/chickpea/… to one token so "chhole masala" and "chickpea curry" overlap. */
function normalizeLegumeTokens(tokens: string[]): string[] {
  return tokens.map((t) => (LEGUME_TOKENS.has(t) ? "__pulse__" : t));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) {
    return 1;
  }
  let inter = 0;
  for (const x of a) {
    if (b.has(x)) {
      inter++;
    }
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function compatiblePulseSaucyMerge(a: string, b: string): boolean {
  if (!hasLegumeToken(a) || !hasLegumeToken(b)) {
    return false;
  }
  if (!looksIndianSaucyDish(a) || !looksIndianSaucyDish(b)) {
    return false;
  }
  const ga = greenDishMarker(a);
  const gb = greenDishMarker(b);
  if (ga !== gb) {
    return false;
  }
  const ta = new Set(normalizeLegumeTokens(tokenizeFoodName(a)));
  const tb = new Set(normalizeLegumeTokens(tokenizeFoodName(b)));
  /* e.g. {pulse, masala} vs {pulse, curry} → 1/3 — still one dish in practice */
  return jaccard(ta, tb) >= 0.3;
}

/**
 * CalorieNinjas often returns a composite line plus shorter overlapping lines
 * ("chhole masala", "masala", "chickpea curry") or duplicate names. Drop redundant
 * rows and merge obvious same-dish synonyms so totals and component rows stay sane.
 */
export function consolidateMealItemLines(items: MealItemLine[]): MealItemLine[] {
  if (items.length <= 1) {
    return items;
  }

  let working = dedupeIdenticalNormalizedNames(items);
  working = dropSubsequenceRedundantLines(working);
  working = mergeLegumeSaucyDuplicates(working);
  return working;
}

function num(n: number | undefined): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/** Same food name repeated (API quirk). Keep the line with the highest calories. */
function dedupeIdenticalNormalizedNames(items: MealItemLine[]): MealItemLine[] {
  const by = new Map<string, MealItemLine>();
  const noKey: MealItemLine[] = [];
  for (const it of items) {
    const key = normFullName(it.name);
    if (!key) {
      noKey.push(it);
      continue;
    }
    const prev = by.get(key);
    if (!prev) {
      by.set(key, it);
      continue;
    }
    if (num(it.calories) > num(prev.calories)) {
      by.set(key, it);
    }
  }
  const kept = [...by.values(), ...noKey];
  return kept.length === items.length ? items : kept;
}

function dropSubsequenceRedundantLines(items: MealItemLine[]): MealItemLine[] {
  const sorted = [...items].sort(
    (a, b) => tokenizeFoodName(b.name).length - tokenizeFoodName(a.name).length,
  );
  const kept: MealItemLine[] = [];

  for (const cand of sorted) {
    const ct = tokenizeFoodName(cand.name);
    if (ct.length === 0) {
      kept.push(cand);
      continue;
    }
    let redundant = false;
    for (const k of kept) {
      const kt = tokenizeFoodName(k.name);
      if (isStrictConsecutiveSubsequence(ct, kt)) {
        redundant = true;
        break;
      }
    }
    if (!redundant) {
      kept.push(cand);
    }
  }

  return kept.length === items.length ? items : kept;
}

/**
 * "Chhole masala" and "chickpea curry" often both appear for one dish; keep the higher-calorie line.
 * Uses pairwise compatibility so unrelated pulse dishes (e.g. with different greens) stay separate.
 */
function mergeLegumeSaucyDuplicates(items: MealItemLine[]): MealItemLine[] {
  const n = items.length;
  if (n <= 1) {
    return items;
  }

  const parent = Array.from({ length: n }, (_, i) => i);
  function find(i: number): number {
    return parent[i] === i ? i : (parent[i] = find(parent[i]!));
  }
  function union(i: number, j: number): void {
    const pi = find(i);
    const pj = find(j);
    if (pi !== pj) {
      parent[pi] = pj;
    }
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (compatiblePulseSaucyMerge(items[i]!.name, items[j]!.name)) {
        union(i, j);
      }
    }
  }

  const groups = new Map<number, MealItemLine[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const list = groups.get(r) ?? [];
    list.push(items[i]!);
    groups.set(r, list);
  }

  const out: MealItemLine[] = [];
  for (const g of groups.values()) {
    if (g.length === 1) {
      out.push(g[0]!);
    } else {
      out.push(g.reduce((a, c) => (num(c.calories) > num(a.calories) ? c : a)));
    }
  }

  return out.length === items.length ? items : out;
}

function sumItemsToTotals(items: MealItemLine[]): Pick<
  MealNutritionEstimate,
  "calories" | "protein_g" | "carbs_g" | "fat_g"
> {
  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  let anyCal = false;
  for (const it of items) {
    if (it.calories != null && Number.isFinite(it.calories)) {
      calories += it.calories;
      anyCal = true;
    }
    if (it.protein_g != null) {
      protein += it.protein_g;
    }
    if (it.carbs_g != null) {
      carbs += it.carbs_g;
    }
    if (it.fat_g != null) {
      fat += it.fat_g;
    }
  }
  return {
    calories: anyCal ? round1(calories) : null,
    protein_g: round1(protein),
    carbs_g: round1(carbs),
    fat_g: round1(fat),
  };
}

/** Apply line consolidation and recompute top-level macros from the kept lines. */
function mealItemsStructuralChange(before: MealItemLine[], after: MealItemLine[]): boolean {
  if (before.length !== after.length) {
    return true;
  }
  for (let i = 0; i < before.length; i++) {
    const x = before[i]!;
    const y = after[i]!;
    if (x.name !== y.name || x.calories !== y.calories) {
      return true;
    }
  }
  return false;
}

export function consolidateMealNutritionEstimate(est: MealNutritionEstimate): MealNutritionEstimate {
  const raw = est.items ?? [];
  if (raw.length <= 1) {
    return est;
  }
  const items = consolidateMealItemLines(raw);
  if (!mealItemsStructuralChange(raw, items)) {
    return est;
  }
  const totals = sumItemsToTotals(items);
  return {
    ...est,
    ...totals,
    items,
  };
}
