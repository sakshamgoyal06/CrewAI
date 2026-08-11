import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";
import type { Tool } from "@anthropic-ai/sdk/resources/index.js";

import { logger } from "../../logger.js";
import { completeMealLogFromPipeline, completeMealLogWithEstimate } from "../../meals/mealLogPipeline.js";
import { estimateMealNutrition } from "../../meals/estimateMealNutrition.js";
import { anthropic } from "../../tools/clients.js";
import type { AgentContext, AgentResult } from "../types.js";
import type { MealLogKind, MealSlot } from "../../meals/parseMealLogCommand.js";
import { buildAgentMessages } from "../memory/memoryAgent.js";
import {
  buildAggregateMealEstimate,
  estimateMealComponentsInParallel,
  extractMealComponentsFromMessage,
  reconcileParserWithApiResults,
  summarizeEstimateForReconcile,
} from "./mealParserAgent.js";
import { describeMealFromPhoto } from "../../meals/mealPhotoEstimate.js";
import { downloadTelegramPhoto } from "../../meals/telegramPhotoDownload.js";
import { buildSpecialistIdentity } from "../promptIdentity.js";
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
  options?: { mealSlot?: MealSlot; logKind?: MealLogKind },
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
      timezone: ctx.timezone,
      mealSlot: options?.mealSlot,
      logKind: options?.logKind,
    });

    if (!done.ok) {
      return {
        text: done.reply,
        metadata: {
          specialist: "nutrition",
          department: "HEALTH",
          meal_log: false,
          meal_parser_pipeline: true,
          error: true,
          pillar_compose: false,
        },
      };
    }

    return {
      text: done.reply,
      metadata: {
        specialist: "nutrition",
        department: "HEALTH",
        meal_log: true,
        meal_parser_pipeline: true,
        orchestrated_meal_log: true,
        meal_session_id: done.mealSessionId,
        meal_log_compose: done.compose,
        pillar_compose: false,
        magnus_voice_finalized: true,
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
          meal_log: false,
          fallback_direct_pipeline: true,
          error: true,
          pillar_compose: false,
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
        meal_log_compose: fb.compose,
        pillar_compose: false,
        magnus_voice_finalized: true,
      },
    };
  }
}

/** Optional tool use for general nutrition Q&A (calorie lookups). */
export async function runOrchestratedNutritionAdviceTurn(ctx: AgentContext): Promise<AgentResult> {
  const userBlock = `${ctx.rawMessage}${ctx.healthPreferences ?? ""}`;
  const messages: Anthropic.MessageParam[] = buildAgentMessages(ctx, userBlock);

  for (let round = 0; round < 5; round++) {
    const msg = await anthropic.messages.create({
      model: HEALTH_SPECIALIST_MODEL,
      max_tokens: 768,
      system: `${buildSpecialistIdentity(ctx)}\n\n${NUTRITION_ADVICE_AGENT_SYSTEM}`,
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
    system: `${buildSpecialistIdentity(ctx)}\n\n${NUTRITION_SYSTEM}`,
    messages: buildAgentMessages(ctx, userBlock),
  });
  const text = textFromMessage(fallback).trim() || "…";
  return {
    text,
    metadata: { specialist: "nutrition", department: "HEALTH", nutrition_agent_tools: false },
  };
}

/** Vision meal log from a Telegram photo (+ optional caption). */
export async function runMealPhotoLogTurn(ctx: AgentContext): Promise<AgentResult> {
  const fileId = ctx.mealPhoto?.fileId;
  if (!fileId) {
    return {
      text: "No photo attached — send a meal picture or type what you ate.",
      metadata: { specialist: "MealPhoto", meal_log: false },
    };
  }

  try {
    const photo = ctx.photoContext?.downloaded ?? (await downloadTelegramPhoto(fileId));
    const description = await describeMealFromPhoto({
      photo,
      caption: ctx.mealPhoto?.caption ?? ctx.rawMessage,
      healthPreferences: ctx.healthPreferences ?? null,
    });

    if (description.startsWith("NOT_FOOD:")) {
      const reason = description.slice("NOT_FOOD:".length).trim() || "not a meal";
      return {
        text: `That doesn't look like a meal photo (${reason}). Paste the text here or describe what you need and I'll help.`,
        metadata: {
          specialist: "MealPhoto",
          meal_log: false,
          not_food_photo: true,
          pillar_compose: false,
        },
      };
    }

    const slotHint = ctx.rawMessage.match(/\b(breakfast|lunch|dinner|snack)\b/i)?.[1]?.toLowerCase();
    const mealSlot =
      slotHint === "breakfast" ||
      slotHint === "lunch" ||
      slotHint === "dinner" ||
      slotHint === "snack"
        ? slotHint
        : undefined;

    return runOrchestratedMealLogTurn(ctx, description, ctx.rawMessage || `[meal photo] ${description}`, {
      mealSlot,
      logKind: mealSlot === "snack" ? "snack" : "meal",
    });
  } catch (err) {
    logger.warn({ err: String(err) }, "meal photo log failed");
    return {
      text: "I couldn't read that photo well enough to log — try again with better light, or type what you ate.",
      metadata: { specialist: "MealPhoto", meal_log: false, error: String(err) },
    };
  }
}

/** Namespace for Anthropic param types (avoids importing conflicting names). */
namespace Anthropic {
  export type MessageParam = import("@anthropic-ai/sdk/resources/messages/messages.js").MessageParam;
  export type ToolResultBlockParam =
    import("@anthropic-ai/sdk/resources/messages/messages.js").ToolResultBlockParam;
}
