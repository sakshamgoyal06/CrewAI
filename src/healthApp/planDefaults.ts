/**
 * Recommended by default (12 Nov plan, item 7): where Magnus used to wait for a pick (a plan-change
 * card, the meal plan's gaps), it applies the suggested answer and shows Undo and the other ways.
 * A new goal date always still needs their yes. MAGNUS_PLAN_DEFAULTS=off brings back the wait.
 */
export const planDefaultsOn = (env: NodeJS.ProcessEnv = process.env): boolean => env.MAGNUS_PLAN_DEFAULTS !== "off";
