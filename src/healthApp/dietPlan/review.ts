/**
 * Model review of a diet plan before the person sees it (Saksham, plan doc decision 2): is there
 * enough variety, do the foods in each meal go together (no roti with cheela), and do the
 * calories and portions look right. Code pairing rules run first, so the model only catches
 * what they miss. Anything flagged is dropped and refilled by code, then checked once more.
 *
 * Haiku only, one call per review. Off unless MAGNUS_PLAN_REVIEW=on, because it adds cost
 * (about ₹15 per user a month, estimate) and Saksham confirms cost before it goes live.
 * A failed or slow review never blocks the plan: it just ships without one.
 */
import type { Anthropic } from "@anthropic-ai/sdk";
import { z } from "zod";

import { logger } from "../../logger.js";
import { chatFastModel } from "../../models.js";
import { anthropic } from "../../tools/clients.js";
import { loggableError } from "../../util/loggableError.js";
import type { MealOption } from "./compose.js";
import type { MealBudget } from "./targets.js";

export type CreateFn = (p: Record<string, unknown>) => Promise<Anthropic.Message>;

export const reviewEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => env.MAGNUS_PLAN_REVIEW === "on";

export const ISSUE_KINDS = ["pairing", "variety", "calories", "portion", "diet"] as const;

const issueSchema = z.object({
  optionId: z.string(),
  kind: z.enum(ISSUE_KINDS),
  problem: z.string().max(200),
});
const reviewSchema = z.object({ issues: z.array(issueSchema).max(40) });
export type ReviewIssue = z.infer<typeof issueSchema>;
export type PlanReview = { model: string; at: string; issues: ReviewIssue[] };

const TOOL = {
  name: "report_plan_issues",
  description: "Report every meal option that should be dropped, with the reason. Empty list when all are fine.",
  input_schema: {
    type: "object",
    properties: {
      issues: {
        type: "array",
        items: {
          type: "object",
          properties: {
            optionId: { type: "string" },
            kind: { type: "string", enum: [...ISSUE_KINDS] },
            problem: { type: "string", description: "One short sentence." },
          },
          required: ["optionId", "kind", "problem"],
        },
      },
    },
    required: ["issues"],
  },
} as const;

const SYSTEM = `You check an Indian home-food meal plan before a person sees it. Each meal has options; each option lists foods with portions and totals. Flag an option only when it is clearly wrong:
- pairing: foods that don't belong in one meal in Indian eating (roti with cheela or dosa, two rice dishes, poha with dal, sambar with oats).
- portion: a portion no one would eat (6 rotis at breakfast, 3 katori of rice as a snack).
- calories: totals that look wrong for the food and portion (1 katori dal at 600 kcal).
- diet: breaks their diet or restrictions.
- variety: within one meal, options that are near copies of each other (flag the later one).
Do not flag taste preferences or small calorie differences. Call report_plan_issues once.`;

/** The plan as compact text for the model: one line per option. */
export function reviewInput(meals: Array<{ budget: MealBudget; options: MealOption[] }>, personLine: string): string {
  const lines = [`Person: ${personLine}`];
  for (const m of meals) {
    lines.push(`\n${m.budget.slot} (budget ${m.budget.calories} kcal, ${m.budget.proteinG} g protein):`);
    for (const o of m.options) {
      lines.push(`- ${o.id}: ${o.items.map((i) => `${i.text} (${i.kcal} kcal)`).join(" + ")} = ${o.totals.kcal} kcal, ${o.totals.proteinG} g protein`);
    }
  }
  return lines.join("\n");
}

/** The model's answer, keeping only issues about options it was shown. */
export function parseReview(input: unknown, shownIds: Set<string>): ReviewIssue[] | null {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return null;
  return parsed.data.issues.filter((i) => shownIds.has(i.optionId));
}

export async function reviewPlan(
  meals: Array<{ budget: MealBudget; options: MealOption[] }>,
  personLine: string,
  create: CreateFn = (p) => anthropic.messages.create(p as never) as Promise<Anthropic.Message>,
): Promise<PlanReview | null> {
  const model = chatFastModel();
  try {
    const msg = await create({
      model,
      max_tokens: 700,
      system: SYSTEM,
      tools: [TOOL],
      messages: [{ role: "user", content: reviewInput(meals, personLine) }],
    });
    const block = msg.content.find((b) => b.type === "tool_use");
    const ids = new Set(meals.flatMap((m) => m.options.map((o) => o.id)));
    const issues = block && "input" in block ? parseReview(block.input, ids) : null;
    if (!issues) return null;
    return { model, at: new Date().toISOString(), issues };
  } catch (err) {
    logger.warn({ err: loggableError(err) }, "diet plan review failed");
    return null;
  }
}
