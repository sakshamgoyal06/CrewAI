/**
 * Breaks meal items into ingredients with amounts, and finds nutrition for each ingredient in its
 * natural measure (per 100 g / 100 ml, per piece, per slice …) using the Anthropic web_search tool.
 * The result feeds our own food database (`food_nutrition` + `food_recipes`).
 */
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { extractJsonObject } from "../../agents/health/jsonExtract.js";
import { HEALTH_SPECIALIST_MODEL } from "../../agents/health/model.js";
import { logger } from "../../logger.js";
import { anthropic } from "../../tools/clients.js";
import { mealLogAnthropicWebSearchEnabled } from "../mealEnv.js";
import type { FoodUnit } from "../foodParse.js";

export type BreakdownRequestItem = { index: number; phrase: string };

export type BreakdownIngredient = {
  /** Ingredient with its preparation, e.g. "White rice, cooked", "Paneer tikka, air-fried". */
  food: string;
  unit: FoodUnit;
  /** Amount eaten in `unit`s; grams/ml for per_100g/per_100ml. */
  quantity: number;
  /** Nutrition for ONE unit (one piece, one slice …, or 100 g / 100 ml). */
  per_unit: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  grams_per_unit: number | null;
};

export type Breakdown = {
  items: Map<number, BreakdownIngredient[]>;
  serving_assumption: string | null;
  citations: { title: string; url: string }[];
  web_search_requests: number | null;
};

const UNIT_FROM_MODEL: Record<string, FoodUnit> = {
  g: "per_100g", "100g": "per_100g", per_100g: "per_100g",
  ml: "per_100ml", "100ml": "per_100ml", per_100ml: "per_100ml",
  piece: "piece", slice: "slice", cup: "cup", glass: "glass", tbsp: "tbsp", tsp: "tsp", scoop: "scoop",
  bowl: "bowl", serving: "serving",
};

const SYSTEM = `You break meals into ingredients and find nutrition for each ingredient, like a food-tracking app's database (HealthifyMe, IFCT, USDA, labels).

You get numbered meal items. For each item, list the ingredients that make it up, each with:
- food: ingredient name with preparation/variant, title case, e.g. "White rice, cooked", "Paneer tikka, air-fried", "Rajma curry", "Egg, boiled", "Whole wheat roti", "Aloo paratha". A simple item is one ingredient (e.g. "2 rotis" → Whole wheat roti × 2 piece). A home-style dish that is normally logged as one food (dal tadka, baingan sabzi, rajma curry, poha) stays one ingredient; a composed dish (burrito bowl, thali, sandwich, salad bowl) splits into its parts.
- unit: the food's natural measure: "g" for foods weighed (rice, dal, curry, sabzi, paneer, chicken, curd, oil, nuts), "ml" for drinks/milk, "piece" for counted foods (roti, paratha, egg, idli, dosa, banana, biscuit), "slice" for bread/pizza, "tbsp"/"tsp" for spoons, "scoop" for protein powder.
- quantity: amount eaten in that unit (grams if "g", ml if "ml"). Use the amount the person gave; otherwise one typical Indian home serving, and say so.
- per_unit: calories, protein_g, carbs_g, fat_g for ONE unit (for "g"/"ml": per 100 g / 100 ml; for "piece": one piece …).
- grams_per_unit: weight of one piece/slice/… in grams (omit for g/ml).

If a "known foods" list is given, reuse those exact names whenever the ingredient matches, so the database doesn't fill with near-duplicates.

Search the web at most twice in total (one search covering the foods you are least sure of). For common ingredients, standard database values are fine.

Output only one raw JSON object, starting with { and ending with }:
{"items":[{"index":1,"ingredients":[{"food":string,"unit":string,"quantity":number,"per_unit":{"calories":number,"protein_g":number,"carbs_g":number,"fat_g":number},"grams_per_unit"?:number}]}],"serving_assumption":string}

serving_assumption: one or two short sentences (under 220 characters) on amounts you assumed.`;

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number.parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Parses the model's JSON; drops ingredients with missing or negative numbers. */
export function parseBreakdown(raw: string): Omit<Breakdown, "citations" | "web_search_requests"> | null {
  const obj = extractJsonObject(raw.trim().replace(/^```(?:json)?\s*|```$/g, ""));
  if (!obj || typeof obj !== "object" || !Array.isArray((obj as { items?: unknown }).items)) return null;
  const items = new Map<number, BreakdownIngredient[]>();
  for (const it of (obj as { items: unknown[] }).items) {
    const o = it as Record<string, unknown>;
    const index = num(o.index);
    if (index === null || !Array.isArray(o.ingredients)) continue;
    const ings: BreakdownIngredient[] = [];
    for (const ing of o.ingredients) {
      const g = ing as Record<string, unknown>;
      const unit = UNIT_FROM_MODEL[String(g.unit ?? "").toLowerCase().trim()];
      const p = (g.per_unit ?? {}) as Record<string, unknown>;
      const quantity = num(g.quantity);
      const calories = num(p.calories);
      const food = typeof g.food === "string" ? g.food.trim() : "";
      if (!unit || !food || quantity === null || quantity <= 0 || calories === null || calories < 0) continue;
      const gpu = num(g.grams_per_unit);
      ings.push({
        food,
        unit,
        quantity,
        per_unit: {
          calories,
          protein_g: Math.max(0, num(p.protein_g) ?? 0),
          carbs_g: Math.max(0, num(p.carbs_g) ?? 0),
          fat_g: Math.max(0, num(p.fat_g) ?? 0),
        },
        grams_per_unit: gpu !== null && gpu > 0 && unit !== "per_100g" && unit !== "per_100ml" ? gpu : null,
      });
    }
    if (ings.length) items.set(index, ings);
  }
  const sa = (obj as { serving_assumption?: unknown }).serving_assumption;
  return { items, serving_assumption: typeof sa === "string" && sa.trim() ? sa.trim() : null };
}

const TIMEOUT_MS = 40_000;

export async function breakdownViaWebResearch(
  mealText: string,
  items: BreakdownRequestItem[],
  knownFoods: string[],
): Promise<Breakdown | null> {
  if (!items.length || !mealLogAnthropicWebSearchEnabled()) return null;
  const user = [
    `Meal: ${mealText}`,
    "",
    "Items to break down:",
    ...items.map((i) => `${i.index}. ${i.phrase}`),
    knownFoods.length ? `\nKnown foods (reuse these names when they match): ${knownFoods.join("; ")}` : "",
  ].join("\n");
  try {
    const msg = (await anthropic.messages.create(
      {
        model: HEALTH_SPECIALIST_MODEL,
        max_tokens: 2000,
        system: SYSTEM,
        messages: [{ role: "user", content: user }],
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
      } as unknown as Parameters<(typeof anthropic)["messages"]["create"]>[0],
      { timeout: TIMEOUT_MS, maxRetries: 0 },
    )) as Message;
    const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
    const parsed = parseBreakdown(text);
    if (!parsed) {
      logger.warn({ snippet: mealText.slice(0, 120) }, "meal breakdown: JSON parse failed");
      return null;
    }
    const citations: { title: string; url: string }[] = [];
    for (const b of msg.content as unknown as Array<Record<string, unknown>>) {
      if (b.type !== "web_search_tool_result" || !Array.isArray(b.content)) continue;
      for (const r of b.content as Array<Record<string, unknown>>) {
        if (r.type === "web_search_result" && typeof r.url === "string") {
          citations.push({ title: typeof r.title === "string" ? r.title : r.url, url: r.url });
        }
      }
    }
    const usage = (msg as { usage?: { server_tool_use?: { web_search_requests?: number } } }).usage;
    return { ...parsed, citations, web_search_requests: usage?.server_tool_use?.web_search_requests ?? null };
  } catch (err) {
    logger.warn({ err: String(err), snippet: mealText.slice(0, 120) }, "meal breakdown: request failed");
    return null;
  }
}
