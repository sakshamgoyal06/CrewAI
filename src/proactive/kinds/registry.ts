import type { ProactiveKindHandler } from "./types.js";
import { customReminderHandler } from "./customReminder.js";
import { driftGuardHandler } from "./driftGuard.js";
import { eveningJournalHandler } from "./eveningJournal.js";
import { middayEncouragementHandler } from "./middayEncouragement.js";

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
  registerProactiveKind(customReminderHandler);
}

// Register on module load.
registerDefaultProactiveKinds();
