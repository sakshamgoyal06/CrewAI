import type { MealLogKind, MealSlot } from "../../meals/parseMealLogCommand.js";
import { extractPastMealFoodText, extractMealSlotFromMessage } from "../../meals/mealLogIntent.js";
import { parseMealLogCommand } from "../../meals/parseMealLogCommand.js";
import { anthropic } from "../../tools/clients.js";
import type { AgentContext } from "../types.js";
import { augmentUserWithMemory } from "../memory/memoryAgent.js";
import { fetchRecentRoutingTurns } from "../../tools/routingContext.js";
import { extractJsonObject } from "./jsonExtract.js";
import { MEAL_INTAKE_PARSE_SYSTEM } from "./mealParserPrompt.js";
import {
  normalizeParserComponents,
  type MealParserComponent,
} from "./mealParserAgent.js";
import { HEALTH_SPECIALIST_MODEL } from "./model.js";

export type ParsedMealIntake = {
  mealSlot: MealSlot;
  logKind: MealLogKind;
  mealText: string;
  components: MealParserComponent[];
};

export type MealIntakeParseResult = {
  replaceTodayLog: boolean;
  meals: ParsedMealIntake[];
  parserNotes?: string;
  parser: "llm" | "fallback";
};

const VALID_SLOTS = new Set<MealSlot>(["breakfast", "lunch", "dinner", "snack", "unspecified"]);
const VALID_LOG_KINDS = new Set<MealLogKind>([
  "meal",
  "snack",
  "drink",
  "supplement",
  "correction",
]);

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

function isComponentList(raw: unknown): raw is { components: MealParserComponent[] } {
  if (!raw || typeof raw !== "object") {
    return false;
  }
  const c = (raw as { components?: unknown }).components;
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

function parseMealIntakeJson(o: unknown): MealIntakeParseResult | null {
  if (!o || typeof o !== "object") {
    return null;
  }
  const row = o as Record<string, unknown>;
  const mealsRaw = row.meals;
  if (!Array.isArray(mealsRaw) || mealsRaw.length === 0) {
    return null;
  }

  const meals: ParsedMealIntake[] = [];
  for (const mealRaw of mealsRaw) {
    if (!mealRaw || typeof mealRaw !== "object") {
      return null;
    }
    const meal = mealRaw as Record<string, unknown>;
    const mealText =
      typeof meal.meal_text === "string"
        ? meal.meal_text.trim()
        : typeof meal.description === "string"
          ? meal.description.trim()
          : "";
    if (mealText.length < 2) {
      return null;
    }

    const componentsRaw = meal.components;
    if (!isComponentList({ components: componentsRaw })) {
      return null;
    }

    const slotRaw = typeof meal.meal_slot === "string" ? meal.meal_slot.trim() : "unspecified";
    const mealSlot = VALID_SLOTS.has(slotRaw as MealSlot) ? (slotRaw as MealSlot) : "unspecified";

    const logKindRaw = typeof meal.log_kind === "string" ? meal.log_kind.trim() : "meal";
    const logKind = VALID_LOG_KINDS.has(logKindRaw as MealLogKind)
      ? (logKindRaw as MealLogKind)
      : logKindRaw === "drink"
        ? "drink"
        : mealSlot === "snack"
          ? "snack"
          : "meal";

    meals.push({
      mealSlot,
      logKind,
      mealText,
      components: normalizeParserComponents(componentsRaw as MealParserComponent[]),
    });
  }

  if (meals.length === 0) {
    return null;
  }

  const notes = typeof row.notes === "string" ? row.notes.trim() : undefined;
  return {
    replaceTodayLog: row.replace_today_log === true,
    meals,
    parserNotes: notes || undefined,
    parser: "llm",
  };
}

function fallbackSingleMealIntake(message: string): MealIntakeParseResult | null {
  const explicit = parseMealLogCommand(message);
  if (explicit.kind === "meal") {
    const text = explicit.text.trim();
    if (text.length < 2) {
      return null;
    }
    return {
      replaceTodayLog: false,
      meals: [
        {
          mealSlot: explicit.slot,
          logKind: explicit.logKind,
          mealText: text,
          components: [{ user_label: text, api_query: text }],
        },
      ],
      parser: "fallback",
      parserNotes: "explicit_meal_command_fallback",
    };
  }

  const extracted = extractPastMealFoodText(message);
  if (!extracted) {
    return null;
  }
  const mealSlot = extractMealSlotFromMessage(message) ?? "unspecified";
  return {
    replaceTodayLog: false,
    meals: [
      {
        mealSlot,
        logKind: mealSlot === "snack" ? "snack" : "meal",
        mealText: extracted,
        components: [{ user_label: extracted, api_query: extracted }],
      },
    ],
    parser: "fallback",
    parserNotes: "past_meal_text_fallback",
  };
}

/** Parse the full user message into 1+ meals with components (LLM + safe fallback). */
export async function parseMealIntakeFromMessage(ctx: AgentContext): Promise<MealIntakeParseResult | null> {
  const recentTurns = await fetchRecentRoutingTurns(ctx.userProfileId, ctx.telegramUserId, 4);
  const payload = JSON.stringify(
    {
      message: ctx.rawMessage.trim(),
      timezone: ctx.timezone ?? "UTC",
      health_preferences: ctx.healthPreferences ?? null,
      recent_turns: recentTurns.map((t) => ({
        role: t.role,
        preview: t.content.slice(0, 240),
      })),
    },
    null,
    2,
  );

  const userBase = augmentUserWithMemory(payload, ctx.memoryBlock);
  const user =
    ctx.healthReferenceBlock?.trim()
      ? `${userBase}\n\n${ctx.healthReferenceBlock.trim()}`
      : userBase;

  try {
    const msg = await anthropic.messages.create({
      model: HEALTH_SPECIALIST_MODEL,
      max_tokens: 1536,
      system: MEAL_INTAKE_PARSE_SYSTEM,
      messages: [{ role: "user", content: user }],
    });
    const parsed = parseMealIntakeJson(extractJsonObject(textFromContent(msg.content as unknown[])));
    if (parsed) {
      return parsed;
    }
  } catch {
    // fall through
  }

  return fallbackSingleMealIntake(ctx.rawMessage);
}
