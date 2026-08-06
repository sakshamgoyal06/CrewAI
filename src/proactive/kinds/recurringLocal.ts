import type { ProactiveKindContext } from "./types.js";
import type { RecurringLocalSchedule } from "../subscriptions/types.js";

export function recurringLocalSchedule(
  ctx: ProactiveKindContext,
): RecurringLocalSchedule | null {
  const s = ctx.subscription.schedule;
  if (s && typeof s === "object" && (s as RecurringLocalSchedule).type === "recurring_local") {
    return s as RecurringLocalSchedule;
  }
  return null;
}
