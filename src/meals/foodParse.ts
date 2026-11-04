/**
 * Splits a meal description into food components with a quantity and unit, so each food can be
 * looked up in our own food database (`food_nutrition`) by a stable key.
 *
 *   "2 parathas, a bowl of baingan sabzi and 100g curd"
 *   → paratha × 2 piece · baingan sabzi × 1 bowl · curd × 100 g
 */

export type FoodUnit =
  | "per_100g"
  | "per_100ml"
  | "piece"
  | "bowl"
  | "cup"
  | "glass"
  | "slice"
  | "tbsp"
  | "tsp"
  | "plate"
  | "scoop"
  | "ladle"
  | "handful"
  | "serving";

export type FoodComponent = {
  /** The phrase as the person wrote it. */
  phrase: string;
  /** Lookup key: lowercase, singular, no punctuation. */
  foodKey: string;
  /** Food name as written, without the quantity ("baingan sabzi"). */
  name: string;
  /** Amount eaten in `unit`s; grams/ml for the per-100 units. */
  quantity: number;
  unit: FoodUnit;
  /** True when the person gave no amount (we assume one serving). */
  assumedQuantity: boolean;
  /** "small", "medium" or "large" when the person said so ("2 large rotis", "a big bowl"). */
  size?: "small" | "medium" | "large";
};

const SIZE_WORDS: Record<string, "small" | "medium" | "large"> = {
  small: "small", chota: "small", choti: "small", mini: "small",
  medium: "medium", regular: "medium",
  large: "large", big: "large", bada: "large", badi: "large",
};

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  half: 0.5, quarter: 0.25, couple: 2, few: 3,
};

/** Spoken/typed unit → stored unit. Gram and ml units map to the per-100 basis. */
const UNIT_WORDS: Record<string, FoodUnit> = {
  g: "per_100g", gm: "per_100g", gms: "per_100g", gram: "per_100g", grams: "per_100g", gr: "per_100g",
  kg: "per_100g",
  ml: "per_100ml", milliliter: "per_100ml", millilitre: "per_100ml", l: "per_100ml", litre: "per_100ml", liter: "per_100ml",
  piece: "piece", pieces: "piece", pc: "piece", pcs: "piece", nos: "piece", no: "piece",
  bowl: "bowl", bowls: "bowl", katori: "bowl", katoris: "bowl", katoriyan: "bowl",
  ladle: "ladle", ladles: "ladle", karchi: "ladle", karchis: "ladle",
  handful: "handful", handfuls: "handful", mutthi: "handful",
  cup: "cup", cups: "cup",
  glass: "glass", glasses: "glass",
  slice: "slice", slices: "slice",
  tbsp: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp",
  tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp",
  plate: "plate", plates: "plate",
  scoop: "scoop", scoops: "scoop",
  serving: "serving", servings: "serving", portion: "serving", portions: "serving",
  // Packs and measures that stand for one usual serving of that food: "1 packet maggi", "1 peg whisky".
  packet: "serving", packets: "serving", pack: "serving", packs: "serving", sachet: "serving", sachets: "serving",
  tin: "serving", tins: "serving", can: "serving", cans: "serving", peg: "serving", pegs: "serving",
};

/** Words that carry no food identity. */
const FILLER = new Set([
  "of", "some", "the", "my", "small", "medium", "large", "big", "regular", "mini", "chota", "choti", "bada", "badi",
  "full", "approx", "about", "around", "~",
]);

/** Plural → singular for keys; leaves short words and -ss alone ("dal", "glass"). */
function singular(word: string): string {
  if (word.length <= 3 || word.endsWith("ss") || word.endsWith("us")) return word;
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (/(ches|shes|xes|toes|oes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

export function foodKeyFor(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w))
    .map(singular)
    .join(" ")
    .trim();
}

/** One phrase → component, or null when no food name is left after the amount. */
export function parseFoodPhrase(phrase: string): FoodComponent | null {
  const original = phrase.trim();
  let rest = original.toLowerCase().replace(/\s+/g, " ");
  let quantity: number | null = null;
  let unit: FoodUnit | null = null;
  let factor = 1;

  // "100g curd", "1.5 cups rice", "2x eggs", "1/2 bowl dal"
  const num = rest.match(/^(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?\s*(?:x\s+)?/);
  if (num && num[0].length > 0) {
    quantity = Number.parseFloat(num[1]!) / (num[2] ? Number.parseFloat(num[2]) : 1);
    rest = rest.slice(num[0].length);
  } else {
    const word = rest.match(/^([a-z]+)\s+/);
    if (word && NUMBER_WORDS[word[1]!] !== undefined) {
      quantity = NUMBER_WORDS[word[1]!]!;
      rest = rest.slice(word[0].length).replace(/^(?:a|an)\s+/, "");
    }
  }

  // A size word before the unit: "1 large bowl rice", "2 small katori dal".
  let size: FoodComponent["size"];
  const sz = rest.match(/^([a-z]+)\s+/);
  if (sz && SIZE_WORDS[sz[1]!]) {
    size = SIZE_WORDS[sz[1]!];
    rest = rest.slice(sz[0].length);
  }

  // Unit right after the number: "100g", "100 g", "2 bowls of"
  const u = rest.match(/^([a-z]+)\b\.?\s*(?:of\s+)?/);
  if (u && UNIT_WORDS[u[1]!] && (quantity !== null || u[1] !== "no")) {
    const w = u[1]!;
    unit = UNIT_WORDS[w]!;
    if (w === "kg" || w === "l" || w === "litre" || w === "liter") factor = 1000;
    rest = rest.slice(u[0].length);
  }

  const name = rest.replace(/^of\s+/, "").trim();
  // Or anywhere in the name: "2 roti large", "a medium banana".
  size ??= name.split(/\s+/).map((w) => SIZE_WORDS[w]).find(Boolean);
  const foodKey = foodKeyFor(name);
  if (!foodKey) return null;

  const assumedQuantity = quantity === null;
  return {
    phrase: original,
    foodKey,
    name,
    quantity: (quantity ?? 1) * factor,
    unit: unit ?? (assumedQuantity ? "serving" : "piece"),
    assumedQuantity,
    ...(size ? { size } : {}),
  };
}

/** Comma, semicolon, newline, "+", "&" and " and " all separate foods. */
export function splitFoods(text: string): string[] {
  return text
    .split(/\s*(?:[,;\n+&]|\band\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseMealComponents(text: string): FoodComponent[] {
  return splitFoods(text)
    .map(parseFoodPhrase)
    .filter((c): c is FoodComponent => c !== null);
}

/** Human label for an amount: "2 piece", "150 g", "1 bowl". */
export function amountLabel(c: Pick<FoodComponent, "quantity" | "unit">): string {
  const q = Math.round(c.quantity * 100) / 100;
  if (c.unit === "per_100g") return `${q} g`;
  if (c.unit === "per_100ml") return `${q} ml`;
  return `${q} ${c.unit}`;
}
