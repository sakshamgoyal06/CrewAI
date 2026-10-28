/**
 * Short-lived pending meal-log confirmation (Redis) when phrasing is ambiguous.
 */
import { redis } from "../tools/clients.js";
import type { MealLogKind, MealSlot } from "./parseMealLogCommand.js";

const KEY_PREFIX = "meal_log_pending:";
const TTL_SECONDS = 3600;

export type MealLogPending = {
  rawText: string;
  originalMessage: string;
  mealSlot?: MealSlot;
  logKind?: MealLogKind;
};

function key(userProfileId: string): string {
  return `${KEY_PREFIX}${userProfileId}`;
}

export async function setMealLogPending(
  userProfileId: string,
  pending: MealLogPending,
): Promise<void> {
  await redis.set(key(userProfileId), JSON.stringify(pending), { ex: TTL_SECONDS });
}

export async function getMealLogPending(
  userProfileId: string,
): Promise<MealLogPending | null> {
  const raw = await redis.get<string>(key(userProfileId));
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as MealLogPending;
  } catch {
    return null;
  }
}

export async function clearMealLogPending(userProfileId: string): Promise<void> {
  await redis.del(key(userProfileId));
}

const YES_RE = /^\s*(?:yes|yeah|yep|y|confirm|log\s*it|please\s*log)\s*[.!]?\s*$/i;
const NO_RE = /^\s*(?:no|nope|n|skip|cancel|don't|do\s*not)\s*[.!]?\s*$/i;

export function isMealLogConfirmationYes(message: string): boolean {
  return YES_RE.test(message.trim());
}

export function isMealLogConfirmationNo(message: string): boolean {
  return NO_RE.test(message.trim());
}

export function formatMealLogConfirmationPrompt(input: {
  foodText: string;
  mealSlot?: MealSlot;
}): string {
  const slot =
    input.mealSlot && input.mealSlot !== "unspecified"
      ? ` for **${input.mealSlot}**`
      : "";
  return (
    `I couldn't log that automatically — do you want me to log **${input.foodText}**${slot}?\n\n` +
    `Reply **yes** to log it or **no** to skip.`
  );
}
