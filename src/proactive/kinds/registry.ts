import type { ProactiveKindHandler } from "./types.js";
import { mealAdherenceNudgeHandler } from "./mealAdherenceNudge.js";
import { mealEodReconciliationHandler } from "./mealEodReconciliation.js";
import { mealGapNudgeHandler } from "./mealGapNudge.js";
import { mealLogReminderHandler } from "./mealLogReminder.js";
import { weeklyNutritionReviewHandler } from "./weeklyNutritionReview.js";
import { customReminderHandler } from "./customReminder.js";
import { projectConflictReviewHandler } from "./projectConflictReview.js";
import { chatInactivityHandler } from "./chatInactivity.js";
import { driftGuardHandler } from "./driftGuard.js";
import { eveningJournalHandler } from "./eveningJournal.js";
import { monthlyGoalReviewHandler } from "./monthlyGoalReview.js";
import { morningOrientationHandler } from "./morningOrientation.js";
import { middayEncouragementHandler } from "./middayEncouragement.js";
import { staleListNudgeHandler } from "./staleListNudge.js";
import { weekPlanningHandler } from "./weekPlanning.js";
import { weeklyWrapHandler } from "./weeklyWrap.js";

const handlers = new Map<string, ProactiveKindHandler>();

export function registerProactiveKind(handler: ProactiveKindHandler): void {
  handlers.set(handler.kind, handler);
}

export function getProactiveKind(kind: string): ProactiveKindHandler | undefined {
  return handlers.get(kind);
}

export function listProactiveKinds(): ProactiveKindHandler[] {
  return [...handlers.values()];
}

export function registerDefaultProactiveKinds(): void {
  registerProactiveKind(morningOrientationHandler);
  registerProactiveKind(eveningJournalHandler);
  registerProactiveKind(weekPlanningHandler);
  registerProactiveKind(weeklyWrapHandler);
  registerProactiveKind(monthlyGoalReviewHandler);
  registerProactiveKind(middayEncouragementHandler);
  registerProactiveKind(driftGuardHandler);
  registerProactiveKind(staleListNudgeHandler);
  registerProactiveKind(chatInactivityHandler);
  registerProactiveKind(mealLogReminderHandler);
  registerProactiveKind(mealAdherenceNudgeHandler);
  registerProactiveKind(mealEodReconciliationHandler);
  registerProactiveKind(mealGapNudgeHandler);
  registerProactiveKind(weeklyNutritionReviewHandler);
  registerProactiveKind(customReminderHandler);
  registerProactiveKind(projectConflictReviewHandler);
}

// Register on module load.
registerDefaultProactiveKinds();
