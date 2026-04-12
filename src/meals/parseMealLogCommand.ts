export type ParsedMealCommand = { kind: "meal"; text: string } | { kind: "none" };

/**
 * Explicit meal-log commands only (avoids hijacking normal chat).
 * - `/meal ...` (optional @BotName)
 * - `meal: ...`
 * - `log meal: ...`
 */
const MEAL_COMMAND_RE =
  /^(?:\/meal(?:@\S+)?|meal:|log\s*meal:)\s*(.+)$/is;

export function parseMealLogCommand(input: string): ParsedMealCommand {
  const t = input.trim();
  const m = t.match(MEAL_COMMAND_RE);
  const rest = m?.[1]?.trim();
  if (!rest || rest.length < 2) {
    return { kind: "none" };
  }
  return { kind: "meal", text: rest };
}

/** Cheap check before running the meal pipeline — avoids work on unrelated messages. */
export function isMealCommand(input: string): boolean {
  return parseMealLogCommand(input).kind === "meal";
}
