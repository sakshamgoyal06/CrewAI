export const INTENTS = [
  "HEALTH",
  "WEALTH",
  "BUILD",
  "PLANNING",
  "RELATIONSHIPS",
  "LEARNING",
  "HAPPINESS",
  "CULTURE",
  "NOTION",
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
