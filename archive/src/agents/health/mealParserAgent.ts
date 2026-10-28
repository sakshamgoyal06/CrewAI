import { estimateMealNutrition } from "../../meals/estimateMealNutrition.js";
import { consolidateMealNutritionEstimate } from "../../meals/mealItemConsolidate.js";
import type { MealItemLine, MealNutritionEstimate } from "../../meals/types.js";
import { anthropic } from "../../tools/clients.js";
import { augmentUserWithMemory } from "../memory/memoryAgent.js";
import { extractJsonObject } from "./jsonExtract.js";
import { MEAL_PARSER_EXTRACT_SYSTEM, MEAL_PARSER_RECONCILE_SYSTEM } from "./mealParserPrompt.js";
import { HEALTH_SPECIALIST_MODEL } from "./model.js";

export type MealParserComponent = {
  user_label: string;
  api_query: string;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function textFromContent(content: unknown[]): string {
  for (const block of content) {
    if (typeof block === "object" && block !== null && "type" in block) {
      const b = block as { type?: string; text?: string };
      if (b.type === "text" && typeof b.text === "string") {
        return b.text;
      }
    }
  }
  return "";
}

function isComponentList(o: unknown): o is { components: MealParserComponent[] } {
  if (!o || typeof o !== "object") {
    return false;
  }
  const c = (o as { components?: unknown }).components;
  if (!Array.isArray(c) || c.length === 0) {
    return false;
  }
  return c.every((row) => {
    if (!row || typeof row !== "object") {
      return false;
    }
    const r = row as { user_label?: unknown; api_query?: unknown };
    return (
      typeof r.user_label === "string" &&
      typeof r.api_query === "string" &&
      r.user_label.trim().length > 0 &&
      r.api_query.trim().length > 0
    );
  });
}

export function normalizeParserComponents(raw: MealParserComponent[]): MealParserComponent[] {
  return raw.map((c) => ({
    user_label: c.user_label.trim(),
    api_query: c.api_query.trim(),
  }));
}

export async function extractMealComponentsFromMessage(input: {
  fullUserMessage: string;
  rawMealText: string;
  memoryBlock?: string;
}): Promise<{ components: MealParserComponent[]; parserNotes?: string }> {
  const user = augmentUserWithMemory(
    `Full message:\n${input.fullUserMessage}\n\nFood text to log:\n${input.rawMealText}`,
    input.memoryBlock,
  );
  const msg = await anthropic.messages.create({
    model: HEALTH_SPECIALIST_MODEL,
    max_tokens: 1024,
    system: MEAL_PARSER_EXTRACT_SYSTEM,
    messages: [{ role: "user", content: user }],
  });
  const text = textFromContent(msg.content as unknown[]);
  const parsed = extractJsonObject(text);
  if (!isComponentList(parsed)) {
    return {
      components: [{ user_label: input.rawMealText.trim(), api_query: input.rawMealText.trim() }],
      parserNotes: "parser_fallback_single_component",
    };
  }
  const notesRaw = (parsed as Record<string, unknown>)["notes"];
  const notes = typeof notesRaw === "string" ? notesRaw.trim() : undefined;
  return { components: normalizeParserComponents(parsed.components), parserNotes: notes };
}

export type PerComponentSummary = {
  user_label: string;
  api_query: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  item_names: string[];
  source: string;
};

export function summarizeEstimateForReconcile(
  comp: MealParserComponent,
  est: MealNutritionEstimate,
): PerComponentSummary {
  const e = consolidateMealNutritionEstimate(est);
  return {
    user_label: comp.user_label,
    api_query: comp.api_query,
    calories: e.calories,
    protein_g: e.protein_g,
    carbs_g: e.carbs_g,
    fat_g: e.fat_g,
    item_names: (e.items ?? []).map((i) => i.name).slice(0, 12),
    source: e.source,
  };
}

type ReconcileJson =
  | { approved: true; notes?: string }
  | { approved: false; revised_api_queries: string[]; reason?: string };

function isReconcileJson(o: unknown): o is ReconcileJson {
  if (!o || typeof o !== "object") {
    return false;
  }
  const a = (o as { approved?: unknown }).approved;
  if (a === true) {
    return true;
  }
  if (a === false) {
    const r = (o as { revised_api_queries?: unknown }).revised_api_queries;
    return Array.isArray(r) && r.every((x) => typeof x === "string");
  }
  return false;
}

export async function reconcileParserWithApiResults(input: {
  fullUserMessage: string;
  rawMealText: string;
  components: MealParserComponent[];
  perComponent: PerComponentSummary[];
  memoryBlock?: string;
}): Promise<{ approved: boolean; revised_api_queries?: string[]; reason?: string; notes?: string }> {
  const payload = JSON.stringify(
    {
      user_message: input.fullUserMessage,
      food_text: input.rawMealText,
      components: input.components,
      api_results: input.perComponent,
    },
    null,
    2,
  );
  const user = augmentUserWithMemory(payload, input.memoryBlock);
  const msg = await anthropic.messages.create({
    model: HEALTH_SPECIALIST_MODEL,
    max_tokens: 1024,
    system: MEAL_PARSER_RECONCILE_SYSTEM,
    messages: [{ role: "user", content: user }],
  });
  const text = textFromContent(msg.content as unknown[]);
  const parsed = extractJsonObject(text);
  if (!isReconcileJson(parsed)) {
    return { approved: true, notes: "reconcile_parse_failed_treated_as_ok" };
  }
  if (parsed.approved === true) {
    return { approved: true, notes: parsed.notes };
  }
  const revised = parsed.revised_api_queries.map((q) => q.trim()).filter((q) => q.length > 0);
  if (revised.length !== input.components.length) {
    return { approved: true, notes: "revised_queries_misaligned_ignored" };
  }
  return {
    approved: false,
    revised_api_queries: revised,
    reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
  };
}

export async function estimateMealComponentsInParallel(
  components: MealParserComponent[],
): Promise<MealNutritionEstimate[]> {
  return Promise.all(components.map((c) => estimateMealNutrition(c.api_query)));
}

/**
 * One MealNutritionEstimate for DB + formatting: one line per parsed component.
 */
export function buildAggregateMealEstimate(
  components: MealParserComponent[],
  estimates: MealNutritionEstimate[],
): MealNutritionEstimate {
  const items: MealItemLine[] = [];
  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  let anyCal = false;
  const providerParts: Record<string, unknown>[] = [];

  for (let i = 0; i < components.length; i++) {
    const est = consolidateMealNutritionEstimate(estimates[i]!);
    const label = components[i]!.user_label;
    const c = est.calories ?? 0;
    const p = est.protein_g ?? 0;
    const cb = est.carbs_g ?? 0;
    const f = est.fat_g ?? 0;
    if (est.calories != null) {
      anyCal = true;
    }
    calories += c;
    protein += p;
    carbs += cb;
    fat += f;
    items.push({
      name: label,
      calories: est.calories != null ? round1(c) : undefined,
      protein_g: est.protein_g != null ? round1(p) : undefined,
      carbs_g: est.carbs_g != null ? round1(cb) : undefined,
      fat_g: est.fat_g != null ? round1(f) : undefined,
    });
    if (est.providerRaw) {
      providerParts.push({ user_label: label, source: est.source, raw: est.providerRaw });
    }
  }

  const consolidated = estimates.map((e) => consolidateMealNutritionEstimate(e));
  const srcSet = new Set(consolidated.map((e) => e.source));
  const source: MealNutritionEstimate["source"] = srcSet.has("web_research")
    ? "web_research"
    : srcSet.size === 1
      ? consolidated[0]!.source
      : "calorieninjas";

  const servingParts = consolidated
    .map((e, i) => {
      const s = e.serving_assumption?.trim();
      return s ? `${components[i]!.user_label}: ${s}` : null;
    })
    .filter((x): x is string => Boolean(x));

  return {
    calories: anyCal ? round1(calories) : null,
    protein_g: round1(protein),
    carbs_g: round1(carbs),
    fat_g: round1(fat),
    items,
    source,
    serving_assumption: servingParts.length > 0 ? servingParts.join("\n") : null,
    providerRaw: { per_component: providerParts },
  };
}
