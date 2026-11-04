/**
 * What a household actually eats, as opposed to what its diet allows. Being non-vegetarian
 * allows mutton, prawns and squid; it doesn't mean they cook them. The planner builds everyday
 * options only from familiar food and offers the rest under "Try something new". Pure.
 *
 * Familiarity comes, in order of strength, from:
 *   1. what they said (protein frequencies, foods they never cook, home cuisines),
 *   2. what they log (usual meals) and foods they love,
 *   3. a modest starter set for their diet when nothing is known yet.
 * One logged meal is never a permanent preference: usual meals need repeats (frequentMeals.ts).
 */
import type { CatalogEntry } from "../../meals/catalog/index.js";
import type { PersonDiet } from "./compose.js";

/** Protein sources people answer for, roughly how a home plans meals around them. */
export const PROTEIN_GROUPS = ["dal", "paneer", "soya", "egg", "chicken", "fish", "mutton", "seafood", "pork", "beef"] as const;
export type ProteinGroup = (typeof PROTEIN_GROUPS)[number];

export const FREQUENCIES = ["often", "sometimes", "rarely", "never"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export type Habits = {
  /** How often each protein is eaten at home. Unanswered groups use the diet's starter set. */
  proteins?: Partial<Record<ProteinGroup, Frequency>>;
  /** Regional cooking at home besides everyday food ("south_indian", "east_indian"). */
  cuisines?: string[];
  /** Dishes they don't cook ("We don't cook this"). Catalog keys. Dish-level, never whole ingredients. */
  neverCook?: string[];
  /** Dishes they said take too much effort. Ranked down, still offered when time allows. */
  tooMuchEffort?: string[];
};

/** Starter set by diet: what most such homes eat without being told otherwise. */
const STARTER: Record<string, Partial<Record<ProteinGroup, Frequency>>> = {
  vegetarian: { dal: "often", paneer: "often", soya: "sometimes", egg: "never" },
  jain: { dal: "often", paneer: "often", soya: "sometimes", egg: "never" },
  vegan: { dal: "often", soya: "often", paneer: "never", egg: "never" },
  eggetarian: { dal: "often", paneer: "often", soya: "sometimes", egg: "often" },
  // Non-vegetarian: chicken and eggs are the everyday meats; mutton, fish and seafood are
  // occasional or regional, so they wait for a sign (an answer, a log, a love).
  non_vegetarian: { dal: "often", paneer: "sometimes", soya: "rarely", egg: "often", chicken: "often", fish: "rarely", mutton: "rarely", seafood: "rarely", pork: "never", beef: "never" },
  custom: { dal: "often", paneer: "sometimes", soya: "rarely", egg: "often", chicken: "often", fish: "rarely", mutton: "rarely", seafood: "rarely", pork: "never", beef: "never" },
};

const GROUP_WORDS: Record<ProteinGroup, string[]> = {
  dal: ["dal", "rajma", "chole", "chana", "chickpea", "kidney bean", "lentil", "moong", "masoor", "urad", "toor", "arhar", "lobia", "sprout"],
  paneer: ["paneer", "cottage cheese"],
  soya: ["soya", "soy", "tofu"],
  egg: ["egg", "omelette", "anda"],
  chicken: ["chicken", "murgh", "murg", "turkey"],
  fish: ["fish", "rohu", "salmon", "tuna", "pomfret", "surmai", "bangda", "hilsa", "ilish", "bhetki", "sardine", "mackerel", "basa", "kingfish", "machli", "macher"],
  mutton: ["mutton", "lamb", "goat", "gosht", "mangsho", "keema", "yakhni", "rogan josh", "seekh", "shami", "nihari", "paya"],
  seafood: ["prawn", "shrimp", "crab", "lobster", "squid", "calamari", "seafood", "clam", "mussel", "jhinga"],
  pork: ["pork", "bacon", "ham", "sausage", "salami"],
  beef: ["beef", "buff", "veal"],
};

const has = (text: string, w: string) => ` ${text} `.includes(` ${w} `) || ` ${text} `.includes(` ${w}s `);

/** The protein group a food is built around, or null (a vegetable, a grain). Meat beats egg beats paneer beats dal. */
export function proteinGroupOf(e: Pick<CatalogEntry, "key" | "diet" | "category">, terms: Iterable<string> = [e.key]): ProteinGroup | null {
  const all = [...terms].join(" | ");
  const order: ProteinGroup[] = ["seafood", "fish", "mutton", "pork", "beef", "chicken", "egg", "paneer", "soya", "dal"];
  for (const g of order) {
    // Keema without a named meat is mutton keema; chicken keema says so.
    if (GROUP_WORDS[g].some((w) => has(all, w))) {
      if (g === "mutton" && /\bchicken\b/.test(all) && !/\bmutton\b/.test(all)) continue;
      if ((g === "dal") && e.diet === "nonveg") continue;
      return g;
    }
  }
  if (e.category === "dal_curry" && e.diet !== "nonveg") return "dal";
  return null;
}

/** Each group's frequency for this person: their answer, else a love or a usual meal ("often"), else the starter set. */
export function proteinFrequencies(input: { diet: PersonDiet; habits?: Habits; loves?: string[]; usualTexts?: string[] }): Record<ProteinGroup, Frequency> {
  const start = STARTER[input.diet ?? "custom"] ?? STARTER.custom!;
  const out = {} as Record<ProteinGroup, Frequency>;
  for (const g of PROTEIN_GROUPS) out[g] = start[g] ?? "rarely";
  const signals = [...(input.loves ?? []), ...(input.usualTexts ?? [])].map((s) => s.toLowerCase());
  for (const g of PROTEIN_GROUPS) {
    if (signals.some((s) => GROUP_WORDS[g].some((w) => has(s, w)))) out[g] = "often";
  }
  for (const [g, f] of Object.entries(input.habits?.proteins ?? {})) out[g as ProteinGroup] = f as Frequency;
  return out;
}

export type Tier = "core" | "occasional" | "new" | "excluded";

/**
 * Bases most homes don't cook daily (millet rotis, brown rice, thepla as a lunch bread): fine
 * foods, but everyday only for people who said so or log them.
 */
export const SPECIALITY_BASES = new Set([
  "bajra roti", "jowar roti", "ragi roti", "makki roti", "missi roti", "thalipeeth", "akki roti", "baati", "kulcha",
  "rumali roti", "kerala parotta", "amritsari kulcha", "luchi", "kuttu puri", "thepla", "brown rice cooked",
  "millet cooked", "quinoa cooked", "sattu paratha", "palak paratha", "methi paratha",
]);

export type FamiliarityContext = {
  freq: Record<ProteinGroup, Frequency>;
  cuisines: Set<string>;
  neverCook: Set<string>;
  /** Keys of foods they love or log (by name match); always familiar. */
  known: (e: CatalogEntry) => boolean;
  groupOf: (e: CatalogEntry) => ProteinGroup | null;
};

/**
 * How familiar one food is for this household:
 * - excluded: they never cook it, or never eat its protein;
 * - new: a speciality (rare dish, regional dish from a cuisine they don't cook, speciality base,
 *   or a protein they eat rarely) — offered only under "Try something new";
 * - occasional: a protein they eat sometimes — offered, but not in most options;
 * - core: everyday food for them.
 */
export function tierOf(e: CatalogEntry, ctx: FamiliarityContext): Tier {
  if (ctx.neverCook.has(e.key)) return "excluded";
  const g = ctx.groupOf(e);
  const f = g ? ctx.freq[g] : "often";
  if (f === "never") return "excluded";
  if (ctx.known(e)) return f === "sometimes" ? "occasional" : "core";
  if (f === "rarely") return "new";
  if (SPECIALITY_BASES.has(e.key)) return "new";
  if (e.popularity <= 2) return "new";
  if (e.popularity === 3 && e.cuisine !== "everyday" && !ctx.cuisines.has(e.cuisine)) return "new";
  return f === "sometimes" ? "occasional" : "core";
}
