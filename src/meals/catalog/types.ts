/**
 * Magnus food catalog: a curated, versioned food database that ships with the code.
 *
 * Every food has numbers per 100 g (or 100 ml) and the household measures people actually log
 * it in (a katori of dal, a medium roti, a glass of milk), each with its weight. A dish is a
 * recipe of catalog ingredients plus its cooked weight, so its numbers are computed, never typed.
 *
 * Built by the food DB agent (docs/FOOD_DB.md) inside Claude sessions, reviewed in PRs and
 * checked by `catalog.test.ts`. Whole-food numbers come from USDA FoodData Central (public
 * domain); IFCT 2017 and the Indian Nutrient Databank are used only to cross-check.
 */

/** Household measures. `bowl` is one katori. */
export type ServingUnit =
  | "piece"
  | "bowl"
  | "plate"
  | "cup"
  | "glass"
  | "slice"
  | "tbsp"
  | "tsp"
  | "ladle"
  | "handful"
  | "scoop"
  | "serving";

export type ServingSize = "small" | "medium" | "large";

export type Serving = {
  unit: ServingUnit;
  /** Weight of one of these in grams (ml for foods on a per-100 ml basis). */
  grams: number;
  size?: ServingSize;
  /** Used when the person gives no amount ("had dal" → 1 katori). Exactly one per food. */
  default?: boolean;
  /** How it's shown, e.g. "1 katori", "1 medium (6 inch)". Defaults from unit and size. */
  label?: string;
};

export type Category =
  | "grain"
  | "bread"
  | "pulse"
  | "vegetable"
  | "fruit"
  | "dairy"
  | "egg"
  | "meat"
  | "fish"
  | "nut_seed"
  | "fat_oil"
  | "sugar_sweetener"
  | "spice_condiment"
  | "drink"
  | "supplement"
  | "dal_curry"
  | "sabzi"
  | "rice_dish"
  | "breakfast"
  | "snack"
  | "sweet"
  | "meal";

export type Diet = "veg" | "egg" | "nonveg" | "vegan";

/** Per 100 g (or 100 ml). */
export type Macros = { kcal: number; protein: number; carbs: number; fat: number; fiber: number };

export type Source =
  /** USDA FoodData Central; `usda` is the exact USDA description the numbers were taken from. */
  | { kind: "usda"; usda: string }
  /** A typical product label or a standard brand-neutral value (whey, cornflakes). */
  | { kind: "label"; note: string }
  /** Several references agree and no single public-domain entry fits (noted why). */
  | { kind: "reference"; note: string };

type Base = {
  name: string;
  /** Other names people type: Hindi/regional names, spellings ("dahi", "chapathi"). */
  aliases?: string[];
  category: Category;
  diet: Diet;
  basis?: "100g" | "100ml";
  servings: Serving[];
};

export type CatalogFood = Base & { per100: Macros; source: Source };

export type CatalogDish = Base & {
  /** Ingredients for one batch, in grams (ml for per-100 ml foods), by catalog name. */
  recipe: [ingredient: string, grams: number][];
  /** Weight of the finished batch; water and cooking losses make it differ from the sum. */
  cookedGrams: number;
  note?: string;
};
