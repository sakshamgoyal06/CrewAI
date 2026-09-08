import type { DailyLogCompleteness } from "./types.js";

/** Test helper — mirrors private resolveCompleteness in dailyLogStatus.ts */
export function resolveCompleteness(input: {
  hasMorning: boolean;
  hasEvening: boolean;
  hasJournal: boolean;
  hasHealthJournal: boolean;
  declinedEvening: boolean;
}): DailyLogCompleteness {
  if (input.declinedEvening && !input.hasEvening) {
    return "declined";
  }
  if (input.hasEvening && (input.hasMorning || input.hasJournal || input.hasHealthJournal)) {
    return "complete";
  }
  if (input.hasEvening) {
    return "complete";
  }
  if (input.hasMorning && !input.hasEvening) {
    return "morning_only";
  }
  if ((input.hasJournal || input.hasHealthJournal) && !input.hasMorning && !input.hasEvening) {
    return "journal_only";
  }
  if (input.hasMorning || input.hasJournal || input.hasHealthJournal) {
    return "partial";
  }
  return "empty";
}
