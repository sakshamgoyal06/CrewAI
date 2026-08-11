import { anthropic } from "../../../tools/clients.js";
import { logger } from "../../../logger.js";
import { loggableError } from "../../../util/loggableError.js";
import type { AgentContext } from "../../types.js";
import type { PillarExecutionPlan, PlanStepResult } from "./types.js";
import { pillarPlanComposeEnabled } from "./parsePillarStrategy.js";

const COMPOSE_MODEL =
  process.env.MAGNUS_PILLAR_COMPOSE_MODEL?.trim() || "claude-haiku-4-5";

function formatStepOutcomes(stepResults: PlanStepResult[]): string {
  return stepResults
    .map(
      (s, i) =>
        `### Step ${i + 1}: ${s.capability}\n${s.text.trim()}`,
    )
    .join("\n\n");
}

/**
 * Merge multi-step executor outputs into one user-facing reply (Magnus voice, Telegram-friendly).
 */
function isMealPlanQuestionStep(step: PlanStepResult): boolean {
  return step.metadata?.meal_plan_question === true;
}

export async function composePillarPlanReply(
  ctx: AgentContext,
  _plan: PillarExecutionPlan,
  stepResults: PlanStepResult[],
): Promise<string> {
  if (stepResults.length === 0) {
    return "…";
  }

  if (!pillarPlanComposeEnabled()) {
    return stepResults.map((s) => s.text.trim()).join("\n\n---\n\n");
  }

  const mealPlanQa =
    stepResults.length === 1 && stepResults.every((s) => isMealPlanQuestionStep(s));
  const isDayOverview =
    stepResults.length === 1 && stepResults.every((s) => s.metadata?.day_overview === true);
  const isConsultationMerge = stepResults.some((s) => s.capability === "pillar_consultation");
  const isMultiMealLog =
    stepResults.length > 1 &&
    stepResults.every((s) => s.capability === "meal_log" || s.capability === "meal_log_correct");
  const isMultiMealPlanRead =
    stepResults.length > 1 && stepResults.every((s) => s.capability === "meal_plan_read");
  const isListsStep =
    stepResults.length === 1 && stepResults[0]?.capability === "lists";

  const system = `You compose the final Telegram reply for Magnus after internal specialists executed a plan.

Rules:
- Speak as **Magnus** directly to the user — warm, concise, one voice. Never mention specialists, sub-agents, departments, or internal steps.
- One cohesive message — not a numbered dump of agent outputs.
- Include every material fact/action outcome from the steps (confirmations, lists, times, errors).
- Do NOT invent data not present in step outcomes.
- Plain text with **bold** sparingly; under ~350 words unless the user asked for detail.
- No "Step 1/2" headers unless the user asked for a breakdown.
- If the user asked a follow-up question about a meal plan they already saw in chat, answer the question only — do NOT repeat the full plan or draft unless they explicitly asked to see it again.
- Strip journey scaffolding ("Step 1 — How long?", "Let's build a meal plan together") when the user is past that phase — keep only what they need this turn.`;

  if (mealPlanQa) {
    const qaSystem = `${system}

This turn is meal-plan Q&A during review. Deliver the answer and a one-line nudge (save plan / suggest a change). Do NOT paste the draft menu again.`;
    return composeWithLlm(ctx, stepResults, qaSystem);
  }

  if (isDayOverview) {
    const daySystem = `${system}

This turn is a **day overview** (calendar + commitments + meals). Weave the sections into one readable day walkthrough in time order where possible. Keep every event, commitment, and meal — do not drop items. Do not use internal section headers like "Step 1".`;
    return composeWithLlm(ctx, stepResults, daySystem);
  }

  if (isConsultationMerge) {
    const consultContext = stepResults
      .map((s) => s.metadata?.consultation_compose_context)
      .find((c) => typeof c === "string" && c.trim());
    const consultSystem = `${system}

This turn is a **pillar consultation** — Magnus tools and pillar specialists ran in parallel on one user request.

${consultContext ? `Structured outcome (authoritative):\n${consultContext}\n` : ""}
Rules:
- One voice, one message. The architecture succeeded when pillars loaded data and/or Magnus tools completed writes.
- Answer the user's full request (e.g. review workout AND log it) — not each agent draft separately.
- When Hevy or Kite data appears in step outcomes, present it confidently — never say Magnus cannot pull it.
- Strip any stale "I don't have Hevy/Kite access" disclaimers from step drafts.
- Confirm Magnus tool actions (event log, check-in) briefly when they succeeded.
- Only state workout total volume (kg) if a step outcome includes "Session volume (working sets, computed from Hevy)" — never estimate or guess volume.`;
    return composeWithLlm(ctx, stepResults, consultSystem);
  }

  if (isMultiMealLog) {
    const mealLogSystem = `${system}

This turn logged multiple meals in separate steps. Only claim a meal was logged when its step outcome shows a successful save with kcal/macros. If a step shows an error or no save, say that meal was not logged. Sum today's totals only from successfully logged steps.`;
    return composeWithLlm(ctx, stepResults, mealLogSystem);
  }

  if (isMultiMealPlanRead) {
    const planReadSystem = `${system}

This turn read meal plans for multiple days. Present each day's plan from step outcomes exactly — do NOT say a day has no plan when a step outcome lists meals for that date.`;
    return composeWithLlm(ctx, stepResults, planReadSystem);
  }

  if (isListsStep) {
    const listsSystem = `${system}

This turn used list tools. If the step outcome says an item is **already on** a list, say that clearly — do NOT also claim you added it this turn. Only confirm a new add when the tool outcome shows a fresh save.`;
    return composeWithLlm(ctx, stepResults, listsSystem);
  }

  return composeWithLlm(ctx, stepResults, system);
}

async function composeWithLlm(
  ctx: AgentContext,
  stepResults: PlanStepResult[],
  system: string,
): Promise<string> {

  const userContent = [
    `Original user message:\n${ctx.rawMessage.trim()}`,
    "",
    "Step outcomes (internal — synthesize for the user):",
    formatStepOutcomes(stepResults),
  ].join("\n");

  try {
    const msg = await anthropic.messages.create({
      model: COMPOSE_MODEL,
      max_tokens: 768,
      system,
      messages: [{ role: "user", content: userContent }],
    });
    for (const block of msg.content) {
      if (block.type === "text" && block.text.trim()) {
        return block.text.trim();
      }
    }
  } catch (e) {
    logger.warn({ err: loggableError(e) }, "pillar plan compose failed; concatenating steps");
  }

  return stepResults.map((s) => s.text.trim()).join("\n\n");
}

export function formatPriorStepContext(stepResults: PlanStepResult[]): string {
  if (stepResults.length === 0) {
    return "";
  }
  return stepResults
    .map(
      (s) =>
        `[Prior step ${s.step_index + 1} — ${s.capability}]: ${s.text.trim().slice(0, 500)}`,
    )
    .join("\n");
}
