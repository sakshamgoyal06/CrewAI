/**
 * Four pillars plus Magnus himself. The user never picks one — the classifier does, silently.
 *
 * GENERAL is not a fallback bucket: it is Magnus's own work (journaling, logging, calendar,
 * reminders, day management, and anything that spans pillars).
 */
export const INTENTS = [
  "HEALTH",
  "WEALTH",
  "HAPPINESS",
  "WISDOM",
  "GENERAL",
] as const;

export type Intent = (typeof INTENTS)[number];

export function parseIntent(raw: string): Intent {
  const upper = raw.trim().toUpperCase();
  for (const intent of INTENTS) {
    if (new RegExp(`\\b${intent}\\b`).test(upper)) {
      return intent;
    }
  }
  return "GENERAL";
}
