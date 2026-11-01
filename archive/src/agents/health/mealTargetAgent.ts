import { isMealCommand } from "../../meals/parseMealLogCommand.js";
import { loadDailyTargets } from "../../meals/mealDaySummary.js";
import {
  formatMacroTargetsSummary,
  hasAnyMacroTarget,
  parseMacroTargetsFromText,
} from "../../nutrition/parseMacroTargets.js";
import { saveMacroTargets } from "../../nutrition/store/mealTargetStore.js";
import type { AgentContext, AgentResult } from "../types.js";

const SET_TARGET_RE =
  /\b(?:set|update|change)\s+(?:my\s+)?(?:(?:daily\s+)?(?:calorie|calories|kcal|macro|protein|carbs?|fat)\s+targets?|targets?\s+(?:to|at))\b|\b(?:set|update)\s+(?:my\s+)?(?:protein|calories?|carbs?|fat)\s+(?:target|to)\b/i;

const SHOW_TARGET_RE =
  /\b(?:what\s+are\s+my\s+(?:macro\s+)?targets?|show\s+(?:my\s+)?(?:macro\s+)?targets?|my\s+(?:daily\s+)?(?:macro\s+)?targets?)\b/i;

export function matchesMealTargetMessage(rawMessage: string): boolean {
  return SET_TARGET_RE.test(rawMessage) || SHOW_TARGET_RE.test(rawMessage);
}

export type MealTargetCapability = "meal_targets_show" | "meal_targets_set";

export async function executeMealTargetCapability(
  ctx: AgentContext,
  cap: MealTargetCapability,
): Promise<AgentResult> {
  const raw = ctx.rawMessage.trim();

  if (cap === "meal_targets_show") {
    const targets = await loadDailyTargets(ctx.userProfileId);
    if (!targets || !hasAnyMacroTarget(targets)) {
      return {
        text: 'No daily targets saved yet. Say e.g. **"set my targets: 2000 kcal, 140g protein"** or finish Health onboarding.',
        metadata: { specialist: "MealTarget", meal_targets: "empty" },
      };
    }
    return {
      text: `Your daily targets: **${formatMacroTargetsSummary(targets)}**.`,
      metadata: { specialist: "MealTarget", meal_targets: "show" },
    };
  }

  const parsed = parseMacroTargetsFromText(raw);
  if (!hasAnyMacroTarget(parsed)) {
    return {
      text: 'I didn\'t catch numbers — try e.g. **"set my targets: 2000 kcal and 140g protein"**.',
      metadata: { specialist: "MealTarget", meal_targets: "parse_failed" },
    };
  }

  const saved = await saveMacroTargets(ctx.userProfileId, parsed);
  if (!saved.ok) {
    return {
      text: `Could not save targets: ${saved.error}`,
      metadata: { specialist: "MealTarget", meal_targets: "save_failed", error: saved.error },
    };
  }

  return {
    text: `Saved your daily targets: **${saved.summary}**. Meal logs will show 🟢/🔴 against these.`,
    metadata: { specialist: "MealTarget", meal_targets: "saved" },
  };
}

export async function tryMealTargetAgent(ctx: AgentContext): Promise<AgentResult | null> {
  if (isMealCommand(ctx.rawMessage)) {
    return null;
  }

  const raw = ctx.rawMessage.trim();

  if (SHOW_TARGET_RE.test(raw)) {
    return executeMealTargetCapability(ctx, "meal_targets_show");
  }

  if (!SET_TARGET_RE.test(raw)) {
    return null;
  }

  return executeMealTargetCapability(ctx, "meal_targets_set");
}
