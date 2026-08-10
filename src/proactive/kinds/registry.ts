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
import { middayEncouragementHandler } from "./middayEncouragement.js";
import { staleListNudgeHandler } from "./staleListNudge.js";

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
  registerProactiveKind(eveningJournalHandler);
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
