import { isMealCommand } from "../../meals/parseMealLogCommand.js";
import { formatMealBreakdown, targetIndicators } from "../../meals/formatMealLogReply.js";
import { loadDailyTargets } from "../../meals/mealDaySummary.js";
import { localDateKey, timezoneAbbrev } from "../../nutrition/localDate.js";
import {
  getMealSessionComponents,
  getRangeTotals,
  getSessionsForLocalDate,
  softDeleteMostRecentSession,
} from "../../nutrition/store/mealHistoryStore.js";
import {
  formatMacroTargetsSummary,
  hasAnyMacroTarget,
} from "../../nutrition/parseMacroTargets.js";
import type { AgentContext, AgentResult } from "../types.js";

const MEAL_BREAKDOWN_RE =
  /\b(?:meal\s+breakdown|breakdown\s+(?:last\s+)?meal|last\s+meal\s+(?:breakdown|detail|details)|component\s+breakdown|item\s+breakdown)\b/i;

const MEAL_HISTORY_RE =
  /\b(?:what\s+did\s+i\s+eat|meals?\s+(?:today|yesterday|this\s+week)|food\s+log|eating\s+history|show\s+(?:my\s+)?meals?|macros?\s+(?:today|yesterday|last\s+\d+\s+days?)|nutrition\s+(?:today|yesterday|summary|recap)|today(?:'s)?\s+(?:meals?|food|macros?)|yesterday(?:'s)?\s+(?:meals?|food|macros?))\b/i;

const UNDO_MEAL_RE =
  /\b(?:undo\s+(?:last\s+)?meal|delete\s+(?:last\s+)?meal|remove\s+(?:last\s+)?meal|cancel\s+(?:last\s+)?meal)\b/i;

const RANGE_DAYS_RE = /\b(?:last|past)\s+(\d{1,2})\s+days?\b/i;

function offsetLocalDate(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map((x) => Number.parseInt(x, 10));
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function formatSessionLine(index: number, session: Awaited<ReturnType<typeof getSessionsForLocalDate>>[number]): string {
  const slot =
    session.mealSlot !== "unspecified"
      ? `${session.mealSlot.charAt(0).toUpperCase()}${session.mealSlot.slice(1)}: `
      : "";
  const text =
    session.rawText.length > 80 ? `${session.rawText.slice(0, 80)}…` : session.rawText;
  return `${index + 1}. ${slot}${text} — ~${Math.round(session.calories)} kcal · P ${Math.round(session.protein_g)}g`;
}

async function formatDayHistory(
  ctx: AgentContext,
  localDate: string,
  label: string,
): Promise<string> {
  const sessions = await getSessionsForLocalDate(ctx.userProfileId, localDate);
  const tz = timezoneAbbrev(ctx.timezone);
  const targets = await loadDailyTargets(ctx.userProfileId);

  if (!sessions.length) {
    return `No meals logged for **${label}** (${localDate}, ${tz}).`;
  }

  let calories = 0;
  let protein_g = 0;
  let carbs_g = 0;
  let fat_g = 0;
  for (const s of sessions) {
    calories += s.calories;
    protein_g += s.protein_g;
    carbs_g += s.carbs_g;
    fat_g += s.fat_g;
  }

  const day = {
    date: localDate,
    calories: Math.round(calories),
    protein_g: Math.round(protein_g * 10) / 10,
    carbs_g: Math.round(carbs_g * 10) / 10,
    fat_g: Math.round(fat_g * 10) / 10,
  };

  const lines = [
    `**${label}** (${localDate}, ${tz}) — ${sessions.length} meal(s)`,
    "",
    ...sessions.map((s, i) => formatSessionLine(i, s)),
    "",
    `**Total:** ${day.calories} kcal · P ${day.protein_g}g · C ${day.carbs_g}g · F ${day.fat_g}g`,
  ];

  const ind = targetIndicators(day, targets);
  if (ind.length > 0) {
    lines.push("", "**Targets**", ...ind);
  }

  return lines.join("\n");
}

export function matchesMealHistoryMessage(rawMessage: string): boolean {
  return (
    MEAL_HISTORY_RE.test(rawMessage) ||
    UNDO_MEAL_RE.test(rawMessage) ||
    MEAL_BREAKDOWN_RE.test(rawMessage)
  );
}

export type MealHistoryCapability = "meal_history" | "meal_history_undo" | "meal_breakdown";

export async function executeMealHistoryCapability(
  ctx: AgentContext,
  cap: MealHistoryCapability,
): Promise<AgentResult> {
  const raw = ctx.rawMessage.trim();

  if (cap === "meal_history_undo") {
    const result = await softDeleteMostRecentSession(ctx.userProfileId, ctx.timezone);
    if (!result.ok) {
      return {
        text: `Could not undo: ${result.error}.`,
        metadata: { specialist: "MealHistory", meal_history: "undo_failed" },
      };
    }
    const text = result.rawText.length > 60 ? `${result.rawText.slice(0, 60)}…` : result.rawText;
    return {
      text: `Removed your last meal log (\`${result.mealSessionId.slice(0, 8)}…\`): "${text}". Day totals updated for ${result.localDate}.`,
      metadata: {
        specialist: "MealHistory",
        meal_history: "undo",
        meal_session_id: result.mealSessionId,
      },
    };
  }

  if (cap === "meal_breakdown") {
    const detail = await getMealSessionComponents(ctx.userProfileId);
    if (!detail) {
      return {
        text: "No meal logged yet to break down.",
        metadata: { specialist: "MealHistory", meal_history: "breakdown_empty" },
      };
    }
    const { session, components } = detail;
    const mealTotals = {
      calories: session.calories,
      protein_g: session.protein_g,
      carbs_g: session.carbs_g,
      fat_g: session.fat_g,
    };
    return {
      text: formatMealBreakdown({
        mealSlot: session.mealSlot,
        rawText: session.rawText,
        components,
        mealTotals,
      }),
      metadata: {
        specialist: "MealHistory",
        meal_history: "breakdown",
        meal_session_id: session.mealSessionId,
      },
    };
  }

  const today = localDateKey(new Date(), ctx.timezone);
  const lower = raw.toLowerCase();

  if (/\byesterday\b/.test(lower)) {
    const yesterday = offsetLocalDate(today, -1);
    const text = await formatDayHistory(ctx, yesterday, "Yesterday");
    return {
      text,
      metadata: { specialist: "MealHistory", meal_history: "yesterday", local_date: yesterday },
    };
  }

  const rangeMatch = lower.match(RANGE_DAYS_RE);
  if (rangeMatch?.[1] || /\blast\s+week\b|\bthis\s+week\b|\b7\s+days\b/.test(lower)) {
    const days = rangeMatch?.[1] ? Number.parseInt(rangeMatch[1], 10) : 7;
    const from = offsetLocalDate(today, -(days - 1));
    const totals = await getRangeTotals(ctx.userProfileId, from, today);
    const tz = timezoneAbbrev(ctx.timezone);
    const avgCal = totals.days > 0 ? Math.round(totals.calories / totals.days) : 0;
    const text = [
      `**Last ${days} days** (${from} → ${today}, ${tz})`,
      "",
      `**Total:** ${totals.calories} kcal · P ${totals.protein_g}g · C ${totals.carbs_g}g · F ${totals.fat_g}g`,
      `**Average:** ~${avgCal} kcal/day across ${totals.days} day(s) with logs (${totals.sessionCount} meals).`,
    ].join("\n");
    return {
      text,
      metadata: { specialist: "MealHistory", meal_history: "range", from, to: today },
    };
  }

  const text = await formatDayHistory(ctx, today, "Today");
  return {
    text,
    metadata: { specialist: "MealHistory", meal_history: "today", local_date: today },
  };
}

export async function tryMealHistoryAgent(ctx: AgentContext): Promise<AgentResult | null> {
  if (isMealCommand(ctx.rawMessage)) {
    return null;
  }

  const raw = ctx.rawMessage.trim();

  if (UNDO_MEAL_RE.test(raw)) {
    return executeMealHistoryCapability(ctx, "meal_history_undo");
  }

  if (MEAL_BREAKDOWN_RE.test(raw)) {
    return executeMealHistoryCapability(ctx, "meal_breakdown");
  }

  if (!MEAL_HISTORY_RE.test(raw)) {
    return null;
  }

  return executeMealHistoryCapability(ctx, "meal_history");
}

export async function formatTargetsOnFile(userProfileId: string): Promise<string> {
  const targets = await loadDailyTargets(userProfileId);
  if (!targets || !hasAnyMacroTarget(targets)) {
    return "No daily macro targets on file yet.";
  }
  return formatMacroTargetsSummary(targets);
}
