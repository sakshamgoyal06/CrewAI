import { isMealCommand } from "../../meals/parseMealLogCommand.js";
import { localDateKey, timezoneAbbrev } from "../../nutrition/localDate.js";
import { offsetDateKey } from "../../nutrition/parseMealPlanJson.js";
import {
  applyMealPlanTemplate,
  formatTemplateList,
  listMealPlanTemplates,
  saveTemplateFromRange,
} from "../../nutrition/planning/mealPlanTemplateStore.js";
import { buildShoppingListForRange } from "../../nutrition/planning/shoppingList.js";
import {
  copyPlanWeek,
  formatPlanDay,
  formatPlanWeek,
  getPlanEntriesForDate,
  getPlanEntriesForRange,
  skipPlanSlot,
  swapPlanSlot,
} from "../../nutrition/store/mealPlanStore.js";
import type { MealSlot } from "../../nutrition/types.js";
import type { AgentContext, AgentResult } from "../types.js";

const MEAL_PLAN_SHOW_RE =
  /\b(?:what(?:'s| is)\s+(?:planned|on\s+the\s+plan)|show\s+(?:my\s+)?(?:meal\s+)?plan|meal\s+plan\s+(?:for|on)|planned\s+meals?|what\s+(?:am\s+i|are\s+we)\s+(?:eating|having)\s+(?:today|tomorrow|this\s+week))\b/i;

const SKIP_PLAN_RE =
  /\b(?:skip)\s+(?:(today|tomorrow)\s+)?(breakfast|lunch|dinner|snack)\b/i;

const SWAP_PLAN_RE =
  /\b(?:swap)\s+(?:(today|tomorrow)\s+)?(breakfast|lunch|dinner|snack)\s+(?:for|with)\s+(.+)$/i;

const COPY_WEEK_RE =
  /\b(?:repeat|copy)\s+(?:last\s+week(?:'s)?\s+plan|my\s+(?:last\s+)?week(?:'s)?\s+(?:meal\s+)?plan)\b/i;

const SAVE_TEMPLATE_RE =
  /\b(?:save|store)\s+(?:(?:this|the)\s+)?(?:week|plan)\s+as\s+(?:template|template\s+named?)\s+(.+)$/i;

const APPLY_TEMPLATE_RE =
  /\b(?:apply|use|load)\s+(?:template|meal\s+plan\s+template)\s+(.+?)(?:\s+(?:for|starting|from)\s+(?:this\s+week|today|tomorrow|\d{4}-\d{2}-\d{2}))?\s*$/i;

const LIST_TEMPLATES_RE = /\b(?:list|show)\s+(?:my\s+)?(?:meal\s+)?plan\s+templates\b/i;

const SHOPPING_LIST_RE =
  /\b(?:shopping\s+list|grocery\s+list|what\s+to\s+buy)\b/i;

function parsePlanSlot(raw: string): Exclude<MealSlot, "unspecified"> | null {
  const s = raw.toLowerCase();
  if (s === "breakfast" || s === "lunch" || s === "dinner" || s === "snack") {
    return s;
  }
  return null;
}

function resolvePlanDate(
  ctx: AgentContext,
  when: string | undefined,
  rawMessage: string,
): { localDate: string; label: string } {
  const today = localDateKey(new Date(), ctx.timezone);
  const lower = rawMessage.toLowerCase();

  if (when === "tomorrow" || /\btomorrow\b/.test(lower)) {
    const d = offsetDateKey(today, 1);
    return { localDate: d, label: "Tomorrow" };
  }

  if (/\byesterday\b/.test(lower)) {
    const d = offsetDateKey(today, -1);
    return { localDate: d, label: "Yesterday" };
  }

  if (/\bthis\s+week\b/.test(lower)) {
    return { localDate: today, label: "This week" };
  }

  return { localDate: today, label: "Today" };
}

export function matchesMealPlanReadMessage(rawMessage: string): boolean {
  if (isMealCommand(rawMessage)) {
    return false;
  }
  return (
    MEAL_PLAN_SHOW_RE.test(rawMessage) ||
    SKIP_PLAN_RE.test(rawMessage) ||
    SWAP_PLAN_RE.test(rawMessage) ||
    COPY_WEEK_RE.test(rawMessage) ||
    SAVE_TEMPLATE_RE.test(rawMessage) ||
    APPLY_TEMPLATE_RE.test(rawMessage) ||
    LIST_TEMPLATES_RE.test(rawMessage) ||
    SHOPPING_LIST_RE.test(rawMessage)
  );
}

export async function tryMealPlanReadAgent(ctx: AgentContext): Promise<AgentResult | null> {
  if (isMealCommand(ctx.rawMessage)) {
    return null;
  }

  const raw = ctx.rawMessage.trim();
  const today = localDateKey(new Date(), ctx.timezone);
  const tz = timezoneAbbrev(ctx.timezone);

  if (LIST_TEMPLATES_RE.test(raw)) {
    const templates = await listMealPlanTemplates(ctx.userProfileId);
    return {
      text: formatTemplateList(templates),
      metadata: { specialist: "MealPlanRead", meal_plan: "templates_list", count: templates.length },
    };
  }

  const saveTemplateMatch = raw.match(SAVE_TEMPLATE_RE);
  if (saveTemplateMatch?.[1]) {
    const end = offsetDateKey(today, 6);
    const result = await saveTemplateFromRange({
      userProfileId: ctx.userProfileId,
      name: saveTemplateMatch[1].trim(),
      fromDate: today,
      toDate: end,
    });
    if (!result.ok) {
      return {
        text: `Could not save template: ${result.error}`,
        metadata: { specialist: "MealPlanRead", meal_plan: "template_save_failed" },
      };
    }
    return {
      text: `Saved template **${saveTemplateMatch[1].trim()}** (${result.entryCount} meals from this week). Apply with \`use template ${saveTemplateMatch[1].trim()}\`.`,
      metadata: {
        specialist: "MealPlanRead",
        meal_plan: "template_saved",
        template_id: result.templateId,
      },
    };
  }

  const applyTemplateMatch = raw.match(APPLY_TEMPLATE_RE);
  if (applyTemplateMatch?.[1]) {
    const templateName = applyTemplateMatch[1].trim();
    const startDate = /\btomorrow\b/i.test(raw)
      ? offsetDateKey(today, 1)
      : today;
    const result = await applyMealPlanTemplate({
      userProfileId: ctx.userProfileId,
      templateName,
      startDate,
    });
    if (!result.ok) {
      return {
        text: `Could not apply template: ${result.error}`,
        metadata: { specialist: "MealPlanRead", meal_plan: "template_apply_failed" },
      };
    }
    return {
      text: `Applied template **${templateName}** — ${result.savedCount} meal(s) from ${startDate}. Say **save plan** isn't needed (already locked). Review with "show my meal plan".`,
      metadata: {
        specialist: "MealPlanRead",
        meal_plan: "template_applied",
        saved_count: result.savedCount,
      },
    };
  }

  if (SHOPPING_LIST_RE.test(raw)) {
    const end = /\btomorrow\b/i.test(raw) ? offsetDateKey(today, 1) : offsetDateKey(today, 6);
    const from = /\btomorrow\b/i.test(raw) ? offsetDateKey(today, 1) : today;
    const result = await buildShoppingListForRange({
      userProfileId: ctx.userProfileId,
      fromDate: from,
      toDate: end,
    });
    if (!result.ok) {
      return {
        text: result.error,
        metadata: { specialist: "MealPlanRead", meal_plan: "shopping_list_failed" },
      };
    }
    return {
      text: `**Shopping list** (${from} → ${end}):\n\n${result.text}`,
      metadata: { specialist: "MealPlanRead", meal_plan: "shopping_list", from, to: end },
    };
  }

  const copyMatch = COPY_WEEK_RE.test(raw);
  if (copyMatch) {
    const lastWeekStart = offsetDateKey(today, -7);
    const thisWeekStart = today;
    const result = await copyPlanWeek(ctx.userProfileId, lastWeekStart, thisWeekStart);
    if (!result.ok) {
      return {
        text: `Could not copy plan: ${result.error}`,
        metadata: { specialist: "MealPlanRead", meal_plan: "copy_failed" },
      };
    }
    return {
      text: `Copied **${result.savedCount}** meal(s) from last week onto this week (${thisWeekStart} → ${offsetDateKey(thisWeekStart, 6)}, ${tz}). Say "show my meal plan" to review.`,
      metadata: { specialist: "MealPlanRead", meal_plan: "copied", saved_count: result.savedCount },
    };
  }

  const skipMatch = raw.match(SKIP_PLAN_RE);
  if (skipMatch) {
    const slot = parsePlanSlot(skipMatch[2]!);
    if (!slot) {
      return null;
    }
    const { localDate, label } = resolvePlanDate(ctx, skipMatch[1], raw);
    const result = await skipPlanSlot(ctx.userProfileId, localDate, slot);
    if (!result.ok) {
      return {
        text: `Could not skip: ${result.error}`,
        metadata: { specialist: "MealPlanRead", meal_plan: "skip_failed" },
      };
    }
    return {
      text: `Skipped **${slot}** for ${label.toLowerCase()} (${localDate}).`,
      metadata: { specialist: "MealPlanRead", meal_plan: "skipped", local_date: localDate, slot },
    };
  }

  const swapMatch = raw.match(SWAP_PLAN_RE);
  if (swapMatch) {
    const slot = parsePlanSlot(swapMatch[2]!);
    const newTitle = swapMatch[3]?.trim();
    if (!slot || !newTitle) {
      return null;
    }
    const { localDate, label } = resolvePlanDate(ctx, swapMatch[1], raw);
    const result = await swapPlanSlot(ctx.userProfileId, localDate, slot, newTitle);
    if (!result.ok) {
      return {
        text: `Could not swap: ${result.error}`,
        metadata: { specialist: "MealPlanRead", meal_plan: "swap_failed" },
      };
    }
    return {
      text: `Updated **${slot}** for ${label.toLowerCase()} (${localDate}) → ${newTitle}.`,
      metadata: { specialist: "MealPlanRead", meal_plan: "swapped", local_date: localDate, slot },
    };
  }

  if (!MEAL_PLAN_SHOW_RE.test(raw)) {
    return null;
  }

  const { localDate, label } = resolvePlanDate(ctx, undefined, raw);

  if (/\bthis\s+week\b/.test(raw.toLowerCase())) {
    const end = offsetDateKey(today, 6);
    const entries = await getPlanEntriesForRange(ctx.userProfileId, today, end);
    const text = formatPlanWeek(entries, today, end);
    return {
      text: `${text}\n\n_${tz}_`,
      metadata: { specialist: "MealPlanRead", meal_plan: "week", from: today, to: end },
    };
  }

  const entries = await getPlanEntriesForDate(ctx.userProfileId, localDate);
  const text = formatPlanDay(entries, label, localDate);
  return {
    text: `${text}\n\n_${tz}_`,
    metadata: { specialist: "MealPlanRead", meal_plan: "day", local_date: localDate },
  };
}
