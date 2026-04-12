import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";
import type { Tool } from "@anthropic-ai/sdk/resources/index.js";

import { logger } from "../../logger.js";
import { completeMealLogFromPipeline, completeMealLogWithEstimate } from "../../meals/mealLogPipeline.js";
import { estimateMealNutrition } from "../../meals/estimateMealNutrition.js";
import { anthropic } from "../../tools/clients.js";
import type { AgentContext, AgentResult } from "../types.js";
import { augmentUserWithMemory } from "../memory/memoryAgent.js";
import {
  buildAggregateMealEstimate,
  estimateMealComponentsInParallel,
  extractMealComponentsFromMessage,
  reconcileParserWithApiResults,
  summarizeEstimateForReconcile,
} from "./mealParserAgent.js";
import { draftMealLogTelegramIntro } from "./nutritionComposer.js";
import { NUTRITION_SYSTEM } from "./nutritionPrompt.js";
import { HEALTH_SPECIALIST_MODEL } from "./model.js";

const NUTRITION_ADVICE_TOOLS: Tool[] = [
  {
    name: "estimate_meal_nutrition",
    description:
      "Optional: fetch approximate calories/macros when the user asks for numbers. Use clear quantities in grams where possible.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    },
  },
];

const NUTRITION_ADVICE_AGENT_SYSTEM = `${NUTRITION_SYSTEM}

You may call **estimate_meal_nutrition** when the user asks for calorie or macro numbers about specific foods. Otherwise answer from general guidance without tools. Keep replies focused.`;

function textFromMessage(msg: Message): string {
  for (const block of msg.content) {
    if (block.type === "text") {
      return block.text;
    }
  }
  return "";
}

function summarizeEstimateForToolPayload(est: Awaited<ReturnType<typeof estimateMealNutrition>>) {
  return {
    calories: est.calories,
    protein_g: est.protein_g,
    carbs_g: est.carbs_g,
    fat_g: est.fat_g,
    source: est.source,
    item_count: est.items?.length ?? 0,
    item_names: (est.items ?? []).map((i) => i.name).slice(0, 12),
    serving_assumption: est.serving_assumption ?? null,
  };
}

/**
 * Meal log: Magnus → **Meal Parser** (split components) → CalorieNinjas **per component** →
 * **Meal Parser** reconcile vs user text → aggregate estimate → save → **Nutrition** composer (Telegram intro) + numeric block.
 */
export async function runOrchestratedMealLogTurn(
  ctx: AgentContext,
  rawMealText: string,
  fullUserMessage: string,
): Promise<AgentResult> {
  try {
    const parsed = await extractMealComponentsFromMessage({
      fullUserMessage,
      rawMealText,
      memoryBlock: ctx.memoryBlock,
    });
    let components = parsed.components;

    let estimates = await estimateMealComponentsInParallel(components);
    let perSummaries = components.map((c, i) => summarizeEstimateForReconcile(c, estimates[i]!));

    const rec = await reconcileParserWithApiResults({
      fullUserMessage,
      rawMealText,
      components,
      perComponent: perSummaries,
      memoryBlock: ctx.memoryBlock,
    });

    if (!rec.approved && rec.revised_api_queries) {
      components = components.map((c, i) => ({
        user_label: c.user_label,
        api_query: rec.revised_api_queries![i]!,
      }));
      estimates = await estimateMealComponentsInParallel(components);
      perSummaries = components.map((c, i) => summarizeEstimateForReconcile(c, estimates[i]!));
    }

    const aggregate = buildAggregateMealEstimate(components, estimates);

    const done = await completeMealLogWithEstimate({
      userProfileId: ctx.userProfileId,
      rawMealText,
      estimate: aggregate,
    });

    if (!done.ok) {
      return {
        text: done.reply,
        metadata: {
          specialist: "nutrition",
          department: "HEALTH",
          meal_log: true,
          meal_parser_pipeline: true,
          error: true,
        },
      };
    }

    let intro = "";
    try {
      intro = await draftMealLogTelegramIntro({
        rawMealText,
        componentLabels: components.map((c) => c.user_label),
        totalCalories: aggregate.calories,
        parserNotes: parsed.parserNotes,
        reconcileNotes: [rec.notes, rec.reason].filter(Boolean).join(" ") || undefined,
        memoryBlock: ctx.memoryBlock,
      });
    } catch (err) {
      logger.warn({ err }, "nutrition meal log: composer failed; numeric block only");
    }

    const text =
      intro.length > 0 ? `${intro.trim()}\n\n${done.reply}` : done.reply;

    return {
      text,
      metadata: {
        specialist: "nutrition",
        department: "HEALTH",
        meal_log: true,
        meal_parser_pipeline: true,
        nutrition_composer: intro.length > 0,
        orchestrated_meal_log: true,
        meal_session_id: done.mealSessionId,
      },
    };
  } catch (err) {
    logger.warn({ err }, "nutrition meal log: parser pipeline failed; legacy single-query path");
    const fb = await completeMealLogFromPipeline({
      userProfileId: ctx.userProfileId,
      rawMealText,
      nutritionQuery: rawMealText,
    });
    if (!fb.ok) {
      return {
        text: fb.reply,
        metadata: {
          specialist: "nutrition",
          department: "HEALTH",
          meal_log: true,
          fallback_direct_pipeline: true,
          error: true,
        },
      };
    }
    return {
      text: fb.reply,
      metadata: {
        specialist: "nutrition",
        department: "HEALTH",
        meal_log: true,
        fallback_direct_pipeline: true,
        meal_session_id: fb.mealSessionId,
      },
    };
  }
}

/** Optional tool use for general nutrition Q&A (calorie lookups). */
export async function runOrchestratedNutritionAdviceTurn(ctx: AgentContext): Promise<AgentResult> {
  const userBlock = augmentUserWithMemory(
    `${ctx.rawMessage}${ctx.healthPreferences ?? ""}`,
    ctx.memoryBlock,
  );
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userBlock }];

  for (let round = 0; round < 5; round++) {
    const msg = await anthropic.messages.create({
      model: HEALTH_SPECIALIST_MODEL,
      max_tokens: 768,
      system: NUTRITION_ADVICE_AGENT_SYSTEM,
      tools: NUTRITION_ADVICE_TOOLS,
      messages,
    });

    if (msg.stop_reason === "end_turn") {
      const text = textFromMessage(msg).trim() || "…";
      return {
        text,
        metadata: {
          specialist: "nutrition",
          department: "HEALTH",
          nutrition_agent_tools: true,
        },
      };
    }

    if (msg.stop_reason !== "tool_use") {
      break;
    }

    messages.push({ role: "assistant", content: msg.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of msg.content) {
      if (block.type !== "tool_use" || block.name !== "estimate_meal_nutrition") {
        continue;
      }
      const input = block.input as { query?: string };
      const q = typeof input.query === "string" ? input.query.trim() : "";
      if (!q) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify({ ok: false, error: "missing query" }),
        });
        continue;
      }
      const est = await estimateMealNutrition(q);
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify({ ok: true, estimate: summarizeEstimateForToolPayload(est) }),
      });
    }
    if (toolResults.length === 0) {
      break;
    }
    messages.push({ role: "user", content: toolResults });
  }

  const fallback = await anthropic.messages.create({
    model: HEALTH_SPECIALIST_MODEL,
    max_tokens: 512,
    system: NUTRITION_SYSTEM,
    messages: [{ role: "user", content: userBlock }],
  });
  const text = textFromMessage(fallback).trim() || "…";
  return {
    text,
    metadata: { specialist: "nutrition", department: "HEALTH", nutrition_agent_tools: false },
  };
}

/** Namespace for Anthropic param types (avoids importing conflicting names). */
namespace Anthropic {
  export type MessageParam = import("@anthropic-ai/sdk/resources/messages/messages.js").MessageParam;
  export type ToolResultBlockParam =
    import("@anthropic-ai/sdk/resources/messages/messages.js").ToolResultBlockParam;
}
