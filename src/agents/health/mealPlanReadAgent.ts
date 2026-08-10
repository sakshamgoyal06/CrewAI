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
  switchPlanSlots,
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

function resolvePlanDateFromHint(
  ctx: AgentContext,
  dateHint: string | undefined,
): { localDate: string; label: string } {
  const today = localDateKey(new Date(), ctx.timezone);
  const hint = dateHint?.toLowerCase().trim();

  if (hint === "tomorrow") {
    const d = offsetDateKey(today, 1);
    return { localDate: d, label: "Tomorrow" };
  }

  if (hint === "yesterday") {
    const d = offsetDateKey(today, -1);
    return { localDate: d, label: "Yesterday" };
  }

  if (hint && /^\d{4}-\d{2}-\d{2}$/.test(hint)) {
    return { localDate: hint, label: hint };
  }

  return { localDate: today, label: "Today" };
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

export type MealPlanReadCapability =
  | "meal_plan_read"
  | "meal_plan_skip"
  | "meal_plan_swap"
  | "meal_plan_copy_week"
  | "meal_plan_template_save"
  | "meal_plan_template_apply"
  | "meal_plan_templates_list"
  | "meal_plan_shopping_list";

function strArg(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Pillar strategy executor — capability dispatch without regex first-accept. */
export async function executeMealPlanReadCapability(
  ctx: AgentContext,
  cap: MealPlanReadCapability,
  args: Record<string, unknown> = {},
): Promise<AgentResult> {
  const raw = ctx.rawMessage.trim();
  const today = localDateKey(new Date(), ctx.timezone);
  const tz = timezoneAbbrev(ctx.timezone);

  if (cap === "meal_plan_templates_list") {
    const templates = await listMealPlanTemplates(ctx.userProfileId);
    return {
      text: formatTemplateList(templates),
      metadata: { specialist: "MealPlanRead", meal_plan: "templates_list", count: templates.length },
    };
  }

  if (cap === "meal_plan_template_save") {
    const name = strArg(args, "template_name") ?? raw.match(SAVE_TEMPLATE_RE)?.[1]?.trim();
    if (!name) {
      return {
        text: 'Name the template — e.g. **"save this week as template vegan week"**.',
        metadata: { specialist: "MealPlanRead", meal_plan: "template_save_failed" },
      };
    }
    const end = offsetDateKey(today, 6);
    const result = await saveTemplateFromRange({
      userProfileId: ctx.userProfileId,
      name,
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
      text: `Saved template **${name}** (${result.entryCount} meals from this week). Apply with \`use template ${name}\`.`,
      metadata: {
        specialist: "MealPlanRead",
        meal_plan: "template_saved",
        template_id: result.templateId,
      },
    };
  }

  if (cap === "meal_plan_template_apply") {
    const templateName =
      strArg(args, "template_name") ?? raw.match(APPLY_TEMPLATE_RE)?.[1]?.trim();
    if (!templateName) {
      return {
        text: 'Which template? e.g. **"use template vegan week"**.',
        metadata: { specialist: "MealPlanRead", meal_plan: "template_apply_failed" },
      };
    }
    const startDate =
      strArg(args, "date_hint") === "tomorrow" || /\btomorrow\b/i.test(raw)
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
      text: `Applied template **${templateName}** — ${result.savedCount} meal(s) from ${startDate}. Review with "show my meal plan".`,
      metadata: {
        specialist: "MealPlanRead",
        meal_plan: "template_applied",
        saved_count: result.savedCount,
      },
    };
  }

  if (cap === "meal_plan_shopping_list") {
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

  if (cap === "meal_plan_copy_week") {
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

  if (cap === "meal_plan_skip") {
    const skipMatch = raw.match(SKIP_PLAN_RE);
    const slot =
      parsePlanSlot(strArg(args, "slot") ?? skipMatch?.[2] ?? "") ??
      parsePlanSlot(raw.toLowerCase());
    if (!slot) {
      return {
        text: 'Which slot? e.g. **"skip dinner tomorrow"**.',
        metadata: { specialist: "MealPlanRead", meal_plan: "skip_failed" },
      };
    }
    const { localDate, label } = resolvePlanDate(ctx, skipMatch?.[1], raw);
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

  if (cap === "meal_plan_swap") {
    const slot = parsePlanSlot(strArg(args, "slot") ?? "");
    const exchangeWith = parsePlanSlot(
      strArg(args, "exchange_with_slot") ?? strArg(args, "slot_b") ?? "",
    );
    const dateHint = strArg(args, "date_hint") ?? strArg(args, "when");
    const { localDate, label } = resolvePlanDateFromHint(ctx, dateHint);

    if (slot && exchangeWith) {
      const result = await switchPlanSlots(ctx.userProfileId, localDate, slot, exchangeWith);
      if (!result.ok) {
        return {
          text: `Could not switch slots: ${result.error}`,
          metadata: { specialist: "MealPlanRead", meal_plan: "swap_failed" },
        };
      }
      const entries = await getPlanEntriesForDate(ctx.userProfileId, localDate);
      const titleA = entries.find((e) => e.meal_slot === slot)?.title ?? "—";
      const titleB = entries.find((e) => e.meal_slot === exchangeWith)?.title ?? "—";
      return {
        text: `Switched **${slot}** and **${exchangeWith}** for ${label.toLowerCase()} (${localDate}):\n• **${slot}:** ${titleA}\n• **${exchangeWith}:** ${titleB}`,
        metadata: {
          specialist: "MealPlanRead",
          meal_plan: "swapped",
          local_date: localDate,
          slots: [slot, exchangeWith],
        },
      };
    }

    const swapMatch = raw.match(SWAP_PLAN_RE);
    const resolvedSlot = slot ?? parsePlanSlot(swapMatch?.[2] ?? "");
    const newTitle = strArg(args, "new_title") ?? swapMatch?.[3]?.trim();
    if (!resolvedSlot || !newTitle) {
      return {
        text: 'Try **"swap dinner for lentil soup"**.',
        metadata: { specialist: "MealPlanRead", meal_plan: "swap_failed" },
      };
    }
    const legacyDate = resolvePlanDate(ctx, swapMatch?.[1], raw);
    const swapDate = dateHint ? { localDate, label } : legacyDate;
    const result = await swapPlanSlot(
      ctx.userProfileId,
      swapDate.localDate,
      resolvedSlot,
      newTitle,
    );
    if (!result.ok) {
      return {
        text: `Could not swap: ${result.error}`,
        metadata: { specialist: "MealPlanRead", meal_plan: "swap_failed" },
      };
    }
    return {
      text: `Updated **${resolvedSlot}** for ${swapDate.label.toLowerCase()} (${swapDate.localDate}) → ${newTitle}.`,
      metadata: {
        specialist: "MealPlanRead",
        meal_plan: "swapped",
        local_date: swapDate.localDate,
        slot: resolvedSlot,
      },
    };
  }

  const { localDate, label } = resolvePlanDate(ctx, undefined, raw);
  const horizon = strArg(args, "horizon_hint") ?? raw.toLowerCase();

  if (cap === "meal_plan_read" && (/\bthis\s+week\b/.test(horizon) || horizon.includes("week"))) {
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

export async function tryMealPlanReadAgent(ctx: AgentContext): Promise<AgentResult | null> {
  if (isMealCommand(ctx.rawMessage)) {
    return null;
  }

  const raw = ctx.rawMessage.trim();

  if (LIST_TEMPLATES_RE.test(raw)) {
    return executeMealPlanReadCapability(ctx, "meal_plan_templates_list");
  }

  if (SAVE_TEMPLATE_RE.test(raw)) {
    return executeMealPlanReadCapability(ctx, "meal_plan_template_save");
  }

  if (APPLY_TEMPLATE_RE.test(raw)) {
    return executeMealPlanReadCapability(ctx, "meal_plan_template_apply");
  }

  if (SHOPPING_LIST_RE.test(raw)) {
    return executeMealPlanReadCapability(ctx, "meal_plan_shopping_list");
  }

  if (COPY_WEEK_RE.test(raw)) {
    return executeMealPlanReadCapability(ctx, "meal_plan_copy_week");
  }

  if (SKIP_PLAN_RE.test(raw)) {
    return executeMealPlanReadCapability(ctx, "meal_plan_skip");
  }

  if (SWAP_PLAN_RE.test(raw)) {
    return executeMealPlanReadCapability(ctx, "meal_plan_swap");
  }

  if (!MEAL_PLAN_SHOW_RE.test(raw)) {
    return null;
  }

  return executeMealPlanReadCapability(ctx, "meal_plan_read");
}
