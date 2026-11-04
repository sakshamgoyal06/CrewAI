/**
 * Meal options for the diet plan: 5 to 8 per meal, each portioned in household units to fit its
 * meal's budget, built from the person's usual meals and the food catalog. Pure, no model call.
 *
 * How a lunch or dinner is put together (pairing rules; the model review catches what these miss):
 * - one base (roti-type bread or rice) + a main (dal, curry, paneer dish) + optionally a sabzi,
 * - or a complete dish (rajma chawal, biryani, khichdi) + optionally raita or curd.
 * Breakfast is one breakfast dish (with sambar or chutney where it belongs), a paratha with curd,
 * bread with eggs, or oats with fruit. A snack is one item, or fruit with nuts.
 * Never: a breakfast dish with a roti (roti + cheela), two complete dishes, rice with a rice dish,
 * or a main and a side made of the same thing (paneer with paneer).
 */
import { createHash } from "node:crypto";

import { catalog, servingId, servingLabel, type Catalog, type CatalogEntry } from "../../meals/catalog/index.js";
import { DISHES } from "../../meals/catalog/data/dishes.js";
import { FOODS } from "../../meals/catalog/data/foods.js";
import type { Diet, MealType, Serving } from "../../meals/catalog/types.js";
import { foodKeyFor } from "../../meals/foodParse.js";
import type { MealBudget, PlanSlot } from "./targets.js";

export const MIN_OPTIONS = 5;
export const MAX_OPTIONS = 8;
/** An option fits its meal when its calories are within this share of the budget. */
export const FIT_TOLERANCE = 0.1;

export type Totals = { kcal: number; proteinG: number; carbsG: number; fatG: number; fiberG: number };

export type PlanItem = {
  /** Catalog key, or null for an item from a usual meal that isn't in the catalog. */
  key: string | null;
  name: string;
  servingId: string | null;
  qty: number;
  /** "2 medium roti", "1 katori dal tadka". */
  text: string;
  grams: number | null;
} & Totals;

export type MealOption = {
  /** Stable for the same slot, foods and portions, so likes, hides and pins survive a rebuild. */
  id: string;
  slot: PlanSlot;
  title: string;
  items: PlanItem[];
  totals: Totals;
  origin: "usual" | "catalog";
  /** Minutes to make it at home (the slowest dish in it). */
  prepMinutes: number;
  /** For a usual meal: its key in frequentMeals, so logging it can reuse the usual items. */
  usualKey?: string;
};

/** The person's diet type as onboarding stores it. */
export type PersonDiet = "vegetarian" | "eggetarian" | "non_vegetarian" | "vegan" | "jain" | "custom" | null;

export type ComposeInput = {
  budget: MealBudget;
  diet: PersonDiet;
  avoid: string[];
  loves: string[];
  staples: "roti" | "rice" | "both";
  /** Most prep minutes per option; null = no limit. */
  prepLimit: number | null;
  /** Usual meals for this slot, best first (frequentMeals). */
  usual?: Array<{ key: string; text: string; items: Array<{ name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number }> }>;
  /** Option ids the person hid; never offered again. */
  hidden?: string[];
};

// ---------- catalog roles ----------

type Role = "bread" | "rice" | "main" | "side" | "cool" | "complete" | "breakfast" | "breakfastBread" | "toast" | "egg" | "accompaniment" | "addon" | "protein" | "snack" | "fruit" | "nut" | "porridge";

const RICE_BASE = new Set(["white rice cooked", "brown rice cooked", "jeera rice", "millet cooked", "quinoa cooked"]);
/** Bases most Indian homes don't cook daily: offered only when they love them. */
const NICHE_BASE = new Set(["millet cooked", "quinoa cooked"]);
const STUFFED = new Set(["aloo paratha", "gobi paratha", "paneer paratha", "thepla", "plain paratha"]);
/** Stuffed parathas are a meal with curd, not a base for dal. */
const STUFFED_ONLY = new Set(["aloo paratha", "gobi paratha", "paneer paratha"]);
/** Breads only eaten with one dish (chole bhature is its own entry). */
const NOT_A_BASE = new Set(["bhatura"]);
const SOUTH = new Set(["idli", "plain dosa", "masala dosa", "uttapam", "medu vada"]);
const ACCOMPANIMENTS = new Set(["sambar", "coconut chutney"]);
const COOL = new Set(["raita", "curd"]);
const ADDONS = new Set(["curd", "greek yogurt", "egg boiled", "toned milk", "moong sprout"]);
const TOAST = new Set(["brown bread", "white bread"]);
const EGG_DISHES = new Set(["omelette", "egg bhurji"]);
const PORRIDGE = new Set(["oat porridge"]);
/** Plain protein served beside dal and roti (paneer cubes, tofu, a chicken breast), for meals short on protein. */
const PROTEIN_SIDES = new Set(["paneer", "tofu", "chicken breast cooked"]);
/** Curd and the dishes made from it: one per meal (no kadhi with curd, no curd rice with raita). */
const CURD_BASED = new Set(["curd", "greek yogurt", "raita", "kadhi", "kadhi chawal", "curd rice", "sweet lassi", "buttermilk"]);
/** In the catalog as snacks but not a snack on a plan: drinks, papad, cheese slices. */
const NOT_A_PLAN_SNACK = new Set(["papad", "cheese"]);
/** Dal-family mains: different dals in one meal's options are near copies, so at most two of them. */
const isPlainDal = (e: CatalogEntry) => e.category === "dal_curry" && / dal\b|^dal /.test(e.key) && !e.key.includes("makhani");
const MAX_DAL_OPTIONS = 2;
/** Heavy on oil for the calories; offered, but ranked down. */
const HEAVY = new Set(["puri", "samosa", "medu vada", "vada pav", "bhaji", "plain paratha", "paneer butter masala", "butter chicken"]);
/** Only when they love it or log it: sweets, whey, instant noodles. */
const ONLY_IF_LOVED_CATEGORIES = new Set(["sweet", "supplement"]);
const ONLY_IF_LOVED = new Set(["instant noodle masala dry"]);
/** Shared main ingredients that make a main and a side too alike. */
const PRIMARY = ["paneer", "potato", "chickpea", "chicken", "mutton", "egg", "rajma", "kidney bean"];

/** Every word-key a food stands for: its name, aliases and (for dishes) its ingredients, all the way down. */
function buildTerms(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const dishByKey = new Map(DISHES.map((d) => [foodKeyFor(d.name), d]));
  const aliasesOf = new Map<string, string[]>();
  for (const f of [...FOODS, ...DISHES]) aliasesOf.set(foodKeyFor(f.name), (f.aliases ?? []).map(foodKeyFor));
  const terms = (key: string, seen = new Set<string>()): Set<string> => {
    if (out.has(key)) return out.get(key)!;
    const set = new Set<string>([key, ...(aliasesOf.get(key) ?? [])]);
    const d = dishByKey.get(key);
    if (d && !seen.has(key)) {
      seen.add(key);
      for (const [ing] of d.recipe) for (const t of terms(foodKeyFor(ing), seen)) set.add(t);
    }
    out.set(key, set);
    return set;
  };
  for (const key of aliasesOf.keys()) terms(key);
  return out;
}
let TERMS: Map<string, Set<string>> | null = null;
const termsOf = (key: string): Set<string> => (TERMS ??= buildTerms()).get(key) ?? new Set([key]);

/** Words in an avoid entry that stand for a whole group. */
const AVOID_GROUPS: Record<string, string[]> = {
  dairy: ["milk", "curd", "paneer", "ghee", "butter", "cream", "khoya", "cheese", "yogurt", "lassi", "buttermilk", "chai", "coffee"],
  lactose: ["milk", "curd", "paneer", "cream", "khoya", "cheese", "yogurt", "lassi", "buttermilk", "chai", "coffee"],
  milk: ["milk", "chai", "coffee", "kheer", "lassi"],
  gluten: ["wheat", "atta", "maida", "refined flour", "bread", "pav", "semolina", "sooji", "oat", "noodle", "pasta"],
  wheat: ["wheat", "atta", "maida", "refined flour", "bread", "pav", "semolina", "sooji"],
  nut: ["almond", "cashew", "walnut", "pistachio", "peanut"],
  egg: ["egg", "omelette"],
  meat: ["chicken", "mutton"],
  seafood: ["fish", "prawn", "salmon", "rohu"],
  sugar: ["sugar", "jaggery", "honey", "gulab jamun", "halwa", "kheer"],
  fried: ["puri", "samosa", "vada", "bhaji", "bhatura", "pakora"],
};
/** No root vegetables, onion or garlic for a Jain diet. */
const JAIN_EXCLUDE = ["onion", "garlic", "potato", "aloo", "carrot", "beetroot", "radish", "sweet potato", "ginger"];

function avoidWords(avoid: string[]): string[] {
  const out = new Set<string>();
  for (const raw of avoid) {
    const k = foodKeyFor(raw);
    if (!k) continue;
    out.add(k);
    for (const [group, words] of Object.entries(AVOID_GROUPS)) if (k === group || k === `${group} product`) words.forEach((w) => out.add(w));
  }
  return [...out];
}

const hasWord = (term: string, word: string): boolean => ` ${term} `.includes(` ${word} `);

function containsAny(key: string, words: string[]): boolean {
  if (!words.length) return false;
  for (const t of termsOf(key)) for (const w of words) if (hasWord(t, w)) return true;
  return false;
}

const DIETS_ALLOWED: Record<Exclude<PersonDiet, null | "custom">, Diet[]> = {
  vegetarian: ["veg", "vegan"],
  eggetarian: ["veg", "vegan", "egg"],
  non_vegetarian: ["veg", "vegan", "egg", "nonveg"],
  vegan: ["vegan"],
  jain: ["veg", "vegan"],
};

export function dietAllows(diet: PersonDiet, e: CatalogEntry): boolean {
  if (!diet || diet === "custom") return true;
  if (!DIETS_ALLOWED[diet].includes(e.diet)) return false;
  return diet !== "jain" || !containsAny(e.key, JAIN_EXCLUDE);
}

function roleOf(e: CatalogEntry): Role[] {
  const r: Role[] = [];
  const k = e.key;
  if (RICE_BASE.has(k)) r.push("rice");
  if (e.category === "bread" && !NOT_A_BASE.has(k) && !TOAST.has(k) && k !== "pav" && !STUFFED_ONLY.has(k)) r.push("bread");
  if (STUFFED.has(k)) r.push("breakfastBread");
  if (TOAST.has(k)) r.push("toast");
  if (e.category === "dal_curry" && !COOL.has(k) && !ACCOMPANIMENTS.has(k)) r.push("main");
  if (k === "sambar") r.push("main", "accompaniment");
  if (k === "coconut chutney") r.push("accompaniment");
  if (e.category === "sabzi") r.push(e.per100.protein >= 7 ? "main" : "side");
  if (COOL.has(k)) r.push("cool");
  if (e.category === "meal" || (e.category === "rice_dish" && !RICE_BASE.has(k))) r.push("complete");
  if (e.category === "breakfast" && e.meals.includes("breakfast") && !ACCOMPANIMENTS.has(k)) r.push(EGG_DISHES.has(k) ? "egg" : "breakfast");
  if (PORRIDGE.has(k)) r.push("porridge");
  if (ADDONS.has(k)) r.push("addon");
  if (PROTEIN_SIDES.has(k)) r.push("protein");
  if (e.category === "fruit") r.push("fruit");
  if (e.category === "nut_seed" && e.meals.includes("snack") && !["chia seed", "flax seed", "sesame seed", "sunflower seed", "peanut butter"].includes(k)) r.push("nut");
  if ((e.meals.includes("snack") && e.category !== "drink" && !NOT_A_PLAN_SNACK.has(k)) || k === "moong sprout" || k === "egg boiled") r.push("snack");
  return r;
}

// ---------- portions ----------

const r1 = (n: number) => Math.round(n * 10) / 10;

function defaultServing(e: CatalogEntry): Serving | null {
  return e.servings.find((s) => s.default) ?? e.servings[0] ?? null;
}

/** Portion steps for a role, in multiples of the food's usual serving. */
function steps(role: Role, s: Serving): number[] {
  if (role === "accompaniment") return s.unit === "tbsp" ? [2] : [1];
  if (s.unit === "piece" || s.unit === "slice") {
    if (role === "toast") return [2, 3, 4];
    if (role === "bread" || role === "breakfastBread") return s.grams <= 60 ? [1, 2, 3, 4] : [1, 2, 3];
    if (role === "addon" || role === "egg") return [1, 2];
    if (role === "protein") return s.grams <= 30 ? [2, 3, 4] : [1];
    // A big piece (an omelette, a chicken fillet, a slice of pizza): one or two.
    if (s.grams >= 100) return [1, 2];
    if (role === "fruit") return s.grams >= 100 ? [1, 2] : [1, 2, 3];
    if (s.grams <= 50) return role === "snack" ? [1, 2, 3, 4] : [1, 2, 3, 4, 5, 6];
    if (s.grams <= 100) return [1, 2, 3, 4];
    return [1, 2, 3];
  }
  switch (role) {
    case "bread":
    case "breakfastBread":
      return [1, 2, 3, 4];
    case "rice":
      return [0.5, 1, 1.5, 2];
    case "main":
      return [1, 1.5, 2];
    case "side":
      return [0.5, 1, 1.5];
    case "cool":
      return [1];
    case "addon":
      return [1];
    case "complete":
      return [0.75, 1, 1.25, 1.5];
    case "breakfast":
    case "porridge":
    case "egg":
      return [0.75, 1, 1.25, 1.5, 2];
    case "nut":
      return [0.5, 1];
    default:
      return [0.5, 1, 1.5, 2];
  }
}

function fmtQty(q: number): string {
  const whole = Math.floor(q);
  const frac = q - whole;
  const f = frac === 0.5 ? "½" : frac === 0.25 ? "¼" : frac === 0.75 ? "¾" : frac ? String(r1(frac)).slice(1) : "";
  return whole ? `${whole}${f}` : f || "0";
}

/** "Egg, boiled" → "egg"; "Quinoa, cooked" → "quinoa". */
export function shortName(name: string): string {
  return name.split(",")[0]!.trim().toLowerCase();
}

export function itemFor(e: CatalogEntry, s: Serving, qty: number): PlanItem {
  const name = shortName(e.name);
  const label = servingLabel(s).split(",")[0]!.trim();
  let text: string;
  const eggs = /(\d+)[- ](eggs?|whites)\b/.exec(label);
  if (e.key === "egg boiled") {
    text = `${fmtQty(qty)} boiled egg${qty === 1 ? "" : "s"}`;
  } else if (eggs) {
    // "1 2-egg serving egg bhurji" reads badly: "egg bhurji (2 eggs)".
    text = `${name} (${fmtQty(Number(eggs[1]) * qty)} ${eggs[2] === "whites" ? "whites" : "eggs"})`;
  } else if (!s.label && (s.unit === "piece" || s.unit === "serving")) {
    text = `${fmtQty(qty)} ${s.size && s.size !== "medium" ? `${s.size} ` : ""}${name}`;
  } else {
    const unitLabel = label.replace(/\s*\(edible part\)/, "");
    if (/^[2-9]\d* /.test(unitLabel)) {
      // A label that already counts ("2 slices with butter"): "bread butter (2 slices with butter)".
      text = `${qty === 1 ? "" : `${fmtQty(qty)} × `}${name} (${unitLabel})`;
      return item(e, s, qty, text);
    }
    text = unitLabel.startsWith("1 ") ? `${fmtQty(qty)} ${unitLabel.slice(2)}` : `${fmtQty(qty)} ${unitLabel}`;
    if (qty > 1) text = text.replace(/^(\S+) (cube|slice|fillet)\b/, "$1 $2s");
    // "1 breast fillet chicken breast" → "1 chicken breast".
    if (/ breast fillet$/.test(unitLabel)) text = `${fmtQty(qty)} ${name}`;
    const words = name.split(/\s+/).filter((w) => w.length > 2);
    if (!words.every((w) => text.toLowerCase().includes(w.replace(/s$/, "")))) text = `${text} ${name}`;
  }
  return item(e, s, qty, text);
}

function item(e: CatalogEntry, s: Serving, qty: number, text: string): PlanItem {
  const grams = s.grams * qty;
  const f = grams / 100;
  return {
    key: e.key,
    name: e.name,
    servingId: servingId(e.key, s),
    qty,
    text,
    grams: Math.round(grams),
    kcal: Math.round(e.per100.kcal * f),
    proteinG: r1(e.per100.protein * f),
    carbsG: r1(e.per100.carbs * f),
    fatG: r1(e.per100.fat * f),
    fiberG: r1(e.per100.fiber * f),
  };
}

export function sumTotals(items: Totals[]): Totals {
  const t = items.reduce(
    (a, i) => ({ kcal: a.kcal + i.kcal, proteinG: a.proteinG + i.proteinG, carbsG: a.carbsG + i.carbsG, fatG: a.fatG + i.fatG, fiberG: a.fiberG + i.fiberG }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
  );
  return { kcal: Math.round(t.kcal), proteinG: r1(t.proteinG), carbsG: r1(t.carbsG), fatG: r1(t.fatG), fiberG: r1(t.fiberG) };
}

// ---------- pairing rules ----------

/** Why these foods don't belong in one meal; empty when they do. Used for usual meals too. */
export function pairingProblems(keys: string[], cat: Catalog = catalog()): string[] {
  const entries = keys.map((k) => cat.byKey.get(k)).filter((e): e is CatalogEntry => !!e);
  const roles = entries.map((e) => ({ e, r: roleOf(e) }));
  const names = (pred: (x: { e: CatalogEntry; r: Role[] }) => boolean) => roles.filter(pred).map((x) => x.e.name);
  const problems: string[] = [];
  const standalone = names((x) => x.r.includes("breakfast"));
  const breads = names((x) => x.r.includes("bread") || x.r.includes("breakfastBread"));
  if (standalone.length && breads.length) problems.push(`${standalone[0]} and ${breads[0]} don't go together in one meal`);
  if (standalone.length > 1 && new Set(standalone).size > 1) problems.push(`${standalone[0]} and ${standalone[1]} are two breakfasts in one meal`);
  const sides = roles.filter((x) => x.r.includes("accompaniment") && !x.r.includes("main"));
  const southern = roles.some((x) => SOUTH.has(x.e.key));
  if (standalone.length && !southern && roles.some((x) => x.e.key === "sambar" || sides.length)) {
    const acc = roles.find((x) => x.r.includes("accompaniment"))!;
    problems.push(`${acc.e.name} doesn't go with ${standalone[0]}`);
  }
  if ((standalone.length || roles.some((x) => x.r.includes("porridge"))) && roles.some((x) => x.e.key === "sambar") && !southern) {
    problems.push(`sambar doesn't go with ${roles.find((x) => x.r.includes("porridge") || x.r.includes("breakfast"))!.e.name}`);
  }
  const complete = [...new Set(names((x) => x.r.includes("complete")))];
  if (complete.length > 1) problems.push(`${complete[0]} and ${complete[1]} are two full meals`);
  const riceDish = roles.find((x) => x.r.includes("complete") && x.e.category === "rice_dish" || ["rajma chawal", "dal chawal", "chole chawal", "kadhi chawal"].includes(x.e.key));
  if (riceDish && roles.some((x) => x.r.includes("rice"))) problems.push(`${riceDish.e.name} already has rice`);
  if (complete.length && breads.length && !roles.some((x) => x.e.key === "chole bhature")) {
    const c = roles.find((x) => x.r.includes("complete"))!;
    if (c.e.category === "rice_dish") problems.push(`${c.e.name} doesn't go with ${breads[0]}`);
  }
  const curd = [...new Set(roles.filter((x) => CURD_BASED.has(x.e.key)).map((x) => x.e.name))];
  if (curd.length > 1) problems.push(`${curd[0]} and ${curd[1]} are both curd`);
  const south = roles.find((x) => SOUTH.has(x.e.key));
  const vadaWithCurd = south?.e.key === "medu vada" && roles.some((x) => x.e.key === "curd");
  if (south && !vadaWithCurd && !roles.some((x) => x.r.includes("accompaniment"))) problems.push(`${south.e.name} needs sambar or chutney`);
  // A protein side goes with dal or a veg dish, not with a meat curry or another paneer dish.
  const side = roles.find((x) => x.r.includes("protein") && keys.length > 1);
  const heavyMain = roles.find((x) => x !== side && x.r.includes("main") && (x.e.diet === "nonveg" || x.e.diet === "egg" || containsAny(x.e.key, ["paneer"])));
  if (side && heavyMain) problems.push(`${side.e.name} on top of ${heavyMain.e.name} is too much`);
  const mains = roles.filter((x) => x.r.includes("main") || x.r.includes("side") || x.r.includes("protein"));
  for (let i = 0; i < mains.length; i++) {
    for (let j = i + 1; j < mains.length; j++) {
      const a = mains[i]!.e.key;
      const b = mains[j]!.e.key;
      if (a === b) continue;
      const shared = PRIMARY.find((p) => containsAny(a, [p]) && containsAny(b, [p]));
      if (shared) problems.push(`${mains[i]!.e.name} and ${mains[j]!.e.name} are both ${shared}`);
    }
  }
  return problems;
}

// ---------- building options ----------

type Slotted = { role: Role; e: CatalogEntry; s: Serving };

/** The templates a meal is built from: each is a list of roles, optional ones marked with `?`. */
const TEMPLATES: Record<PlanSlot, Array<Array<Role | `${Role}?`>>> = {
  breakfast: [["breakfast", "accompaniment?", "addon?"], ["egg", "toast"], ["breakfastBread", "cool"], ["porridge", "fruit?"], ["egg", "fruit?"]],
  lunch: [["bread", "main", "side?"], ["rice", "main", "side?"], ["bread", "main", "addon"], ["rice", "main", "addon"], ["bread", "main", "protein"], ["rice", "main", "protein"], ["complete", "cool?"]],
  dinner: [["bread", "main", "side?"], ["rice", "main", "side?"], ["bread", "main", "addon"], ["rice", "main", "addon"], ["bread", "main", "protein"], ["rice", "main", "protein"], ["complete", "cool?"]],
  snack: [["snack"], ["fruit", "nut"], ["addon", "fruit?"]],
};

const MEAL_TYPE: Record<PlanSlot, MealType> = { breakfast: "breakfast", lunch: "lunch", dinner: "dinner", snack: "snack" };

function candidates(input: ComposeInput, cat: Catalog): Map<Role, Slotted[]> {
  const avoid = avoidWords(input.avoid);
  const loves = input.loves.map(foodKeyFor).filter(Boolean);
  const loved = (e: CatalogEntry) => loves.some((l) => containsAny(e.key, [l]));
  const out = new Map<Role, Slotted[]>();
  for (const e of cat.entries) {
    if (!dietAllows(input.diet, e)) continue;
    if (containsAny(e.key, avoid)) continue;
    if ((ONLY_IF_LOVED_CATEGORIES.has(e.category) || ONLY_IF_LOVED.has(e.key) || NICHE_BASE.has(e.key)) && !loved(e)) continue;
    const def = defaultServing(e);
    // A bare "100 g" serving isn't a household portion; protein sides use their piece serving (cubes, a fillet).
    const plain100 = !def || (def.unit === "serving" && def.grams === 100 && e.kind === "food" && e.key !== "egg boiled");
    const piece = e.servings.find((x) => x.unit === "piece") ?? null;
    const prep = e.prepMinutes ?? (RICE_BASE.has(e.key) ? 20 : null);
    for (const role of roleOf(e)) {
      const s = role === "protein" ? piece : plain100 ? null : def;
      if (!s) continue;
      // Tofu cubes beside dal suit a vegan; a vegetarian gets paneer unless they like tofu.
      if (role === "protein" && e.key === "tofu" && input.diet !== "vegan" && !loved(e)) continue;
      // Accompaniments, rice and add-ons follow the meal; everything else must be eaten at this meal.
      const followsMeal = ["rice", "accompaniment", "addon", "protein", "cool", "toast", "fruit", "nut"].includes(role);
      if (!followsMeal && !e.meals.includes(MEAL_TYPE[input.budget.slot]) && !(role === "snack" && input.budget.slot === "snack")) continue;
      if (input.prepLimit !== null && (prep ?? 0) > input.prepLimit) continue;
      if (role === "snack" && input.budget.slot !== "snack") continue;
      // Milk goes with breakfast and snacks, not with dal and roti.
      if (role === "addon" && e.key.endsWith("milk") && (input.budget.slot === "lunch" || input.budget.slot === "dinner")) continue;
      const list = out.get(role) ?? [];
      list.push({ role, e, s });
      out.set(role, list);
    }
  }
  return out;
}

function combos(template: Array<Role | `${Role}?`>, pool: Map<Role, Slotted[]>): Slotted[][] {
  let acc: Slotted[][] = [[]];
  for (const part of template) {
    const optional = part.endsWith("?");
    const role = part.replace("?", "") as Role;
    const list = pool.get(role) ?? [];
    if (!list.length && !optional) return [];
    const next: Slotted[][] = [];
    for (const c of acc) {
      if (optional) next.push(c);
      for (const x of list) if (!c.some((y) => y.e.key === x.e.key)) next.push([...c, x]);
    }
    acc = next;
  }
  return acc.filter((c) => c.length);
}

type Scored = { option: MealOption; score: number; anchor: string; base: string | null; highProtein: boolean; rice: boolean; dal: boolean };
/** How much a protein shortfall costs in an option's score, against 2 for its calorie error. */
const PROTEIN_WEIGHT = 3;
/** No add-on or side in more than this many of a meal's options. */
const MAX_ITEM_REPEATS = 2;

function optionId(slot: PlanSlot, items: Array<{ key: string | null; name: string; qty: number }>): string {
  const sig = items.map((i) => `${i.key ?? i.name}:${i.qty}`).sort().join("|");
  return `opt_${slot}_${createHash("sha1").update(sig).digest("hex").slice(0, 12)}`;
}

function titleOf(items: PlanItem[]): string {
  const t = items.map((i) => i.name.toLowerCase()).join(", ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** The best portions for one combination, or null when nothing lands within the tolerance. */
function fit(combo: Slotted[], input: ComposeInput, lovedKeys: string[]): Scored | null {
  const b = input.budget;
  const stepLists = combo.map((x) => steps(x.role, x.s));
  let best: { score: number; items: PlanItem[]; totals: Totals } | null = null;
  const idx = combo.map(() => 0);
  for (;;) {
    const items = combo.map((x, i) => itemFor(x.e, x.s, stepLists[i]![idx[i]!]!));
    const totals = sumTotals(items);
    const kcalErr = Math.abs(totals.kcal - b.calories) / b.calories;
    if (kcalErr <= FIT_TOLERANCE) {
      const pr = b.proteinG ? totals.proteinG / b.proteinG : 1;
      const fatOver = b.fatG ? Math.max(0, totals.fatG / b.fatG - 1.25) : 0;
      // Protein counts most: plans fell short on protein far more often than on calories.
      const score = kcalErr * 2 + Math.max(0, 1 - pr) * PROTEIN_WEIGHT + fatOver * 0.6;
      if (!best || score < best.score) best = { score, items, totals };
    }
    let i = 0;
    while (i < idx.length && ++idx[i]! >= stepLists[i]!.length) idx[i++] = 0;
    if (i === idx.length) break;
  }
  if (!best) return null;

  let score = best.score;
  const keys = combo.map((x) => x.e.key);
  if (keys.some((k) => lovedKeys.some((l) => containsAny(k, [l])))) score -= 0.15;
  if (keys.some((k) => HEAVY.has(k))) score += 0.3;
  const base = combo.find((x) => x.role === "bread" || x.role === "rice") ?? null;
  if (base && input.staples !== "both") score += (input.staples === "roti") === (base.role === "bread") ? -0.1 : 0.15;
  const prep = Math.max(0, ...combo.map((x) => x.e.prepMinutes ?? 20));
  score += prep * 0.002;

  const anchor = (combo.find((x) => ["main", "complete", "breakfast", "egg", "porridge", "breakfastBread", "snack", "fruit", "addon"].includes(x.role)) ?? combo[0]!).e.key;
  return {
    option: {
      id: optionId(b.slot, best.items),
      slot: b.slot,
      title: titleOf(best.items),
      items: best.items,
      totals: best.totals,
      origin: "catalog",
      prepMinutes: prep,
    },
    score,
    anchor,
    base: base?.e.key ?? null,
    highProtein: b.proteinG > 0 && best.totals.proteinG >= b.proteinG * 0.9,
    rice: base?.role === "rice" || combo.some((x) => x.e.category === "rice_dish" || x.e.key.endsWith("chawal")),
    dal: combo.some((x) => x.role === "main" && isPlainDal(x.e)),
  };
}

/** A usual meal rescaled to the budget (¾ to 1¼ of how they usually eat it), or null when it can't fit. */
export function usualOption(
  slot: PlanSlot,
  budget: MealBudget,
  u: NonNullable<ComposeInput["usual"]>[number],
  cat: Catalog = catalog(),
): MealOption | null {
  const base = u.items.reduce((a, i) => a + i.calories, 0);
  if (base <= 0) return null;
  const f = Math.round((budget.calories / base) * 4) / 4;
  if (f < 0.75 || f > 1.25) return null;
  const items: PlanItem[] = u.items.map((i) => ({
    key: cat.byKey.get(foodKeyFor(i.name))?.key ?? null,
    name: i.name,
    servingId: null,
    qty: f,
    text: f === 1 ? i.name : `${i.name} (${fmtQty(f)}× usual)`,
    grams: null,
    kcal: Math.round(i.calories * f),
    proteinG: r1(i.protein_g * f),
    carbsG: r1(i.carbs_g * f),
    fatG: r1(i.fat_g * f),
    fiberG: 0,
  }));
  const totals = sumTotals(items);
  if (Math.abs(totals.kcal - budget.calories) / budget.calories > FIT_TOLERANCE) return null;
  if (pairingProblems(items.map((i) => i.key).filter((k): k is string => !!k), cat).length) return null;
  return {
    id: optionId(slot, [{ key: `usual:${u.key}`, name: u.text, qty: f }]),
    slot,
    title: u.text.charAt(0).toUpperCase() + u.text.slice(1),
    items,
    totals,
    origin: "usual",
    prepMinutes: 0,
    usualKey: u.key,
  };
}

/**
 * 5 to 8 options for one meal: usual meals that fit first, then catalog meals by score, no main
 * dish twice, and at least two that cover the meal's protein when the catalog has them.
 */
export function composeOptions(input: ComposeInput, cat: Catalog = catalog()): MealOption[] {
  let limit = input.prepLimit;
  const out = composeWithin(input, cat, limit === null);
  // Too few meals fit their cooking time (10 minutes for lunch): step the limit up until there
  // are enough, keeping the quick ones first. Repeats of one dish only as a last resort.
  while (out.length < MIN_OPTIONS && limit !== null) {
    limit = PREP_LADDER.find((m) => m > limit!) ?? null;
    for (const o of composeWithin({ ...input, prepLimit: limit }, cat, limit === null)) {
      if (out.length >= MIN_OPTIONS) break;
      if (!out.some((x) => x.id === o.id || x.title === o.title)) out.push(o);
    }
  }
  return out;
}

const PREP_LADDER = [10, 20, 30];

function composeWithin(input: ComposeInput, cat: Catalog, pad: boolean): MealOption[] {
  const hidden = new Set(input.hidden ?? []);
  const lovedKeys = input.loves.map(foodKeyFor).filter(Boolean);
  const out: MealOption[] = [];
  const anchors = new Set<string>();

  for (const u of input.usual ?? []) {
    const o = usualOption(input.budget.slot, input.budget, u, cat);
    if (o && !hidden.has(o.id) && out.length < 3) out.push(o);
  }
  for (const o of out) for (const i of o.items) if (i.key) anchors.add(i.key);

  const pool = candidates(input, cat);
  const scored: Scored[] = [];
  for (const t of TEMPLATES[input.budget.slot]) {
    for (const c of combos(t, pool)) {
      if (pairingProblems(c.map((x) => x.e.key), cat).length) continue;
      const s = fit(c, input, lovedKeys);
      if (s && !hidden.has(s.option.id)) scored.push(s);
    }
  }
  scored.sort((a, b) => a.score - b.score || a.option.id.localeCompare(b.option.id));

  const picked: Scored[] = [];
  const bases = new Map<string, number>();
  const uses = new Map<string, number>();
  const take = (s: Scored) => {
    picked.push(s);
    anchors.add(s.anchor);
    if (s.base) bases.set(s.base, (bases.get(s.base) ?? 0) + 1);
    for (const i of s.option.items) if (i.key && i.key !== s.base && i.key !== s.anchor) uses.set(i.key, (uses.get(i.key) ?? 0) + 1);
  };
  const overused = (s: Scored) => s.option.items.some((i) => i.key && i.key !== s.base && i.key !== s.anchor && (uses.get(i.key) ?? 0) >= MAX_ITEM_REPEATS);
  const room = () => MAX_OPTIONS - out.length - picked.length;
  for (const s of scored) {
    if (room() <= 0) break;
    if (anchors.has(s.anchor)) continue;
    // Variety: the same base (roti) at most three times.
    if (s.base && (bases.get(s.base) ?? 0) >= 3) continue;
    if (overused(s)) continue;
    if (s.dal && picked.filter((p) => p.dal).length >= MAX_DAL_OPTIONS) continue;
    take(s);
  }
  // Rice eaters get at least one rice option.
  if (input.staples !== "roti" && !picked.some((p) => p.rice) && !out.some((o) => o.items.some((i) => i.key && RICE_BASE.has(i.key)))) {
    const rice = scored.find((s) => s.rice && !anchors.has(s.anchor));
    if (rice) {
      if (room() <= 0) picked.pop();
      take(rice);
    }
  }
  // At least two options that cover the meal's protein, swapping out the weakest picks.
  const high = () => out.filter((o) => o.totals.proteinG >= input.budget.proteinG * 0.9).length + picked.filter((p) => p.highProtein).length;
  for (const s of scored) {
    if (high() >= 2) break;
    if (!s.highProtein || picked.includes(s) || anchors.has(s.anchor)) continue;
    const weakest = [...picked].reverse().find((p) => !p.highProtein);
    if (weakest && room() <= 0) picked.splice(picked.indexOf(weakest), 1);
    take(s);
  }
  // Short of the minimum: relax variety (a second option with the same main, different base).
  for (const s of pad ? scored : []) {
    if (out.length + picked.length >= MIN_OPTIONS) break;
    if (!picked.includes(s)) take(s);
  }
  return [...out, ...picked.map((p) => p.option)];
}
