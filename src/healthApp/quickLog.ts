/**
 * Logging without a confirm step (12 Nov plan "make the goal inevitable", item 5). A confirm tap
 * is where logs die: 9 chat drafts were never confirmed in the first real week. A usual meal, or a
 * chat meal whose every item came from the food database with the meal slot known, is logged at
 * once; the card shows it as logged, with Edit and Undo (PR #225), so a wrong portion is one tap
 * to fix. Anything estimated by a model or the web, with a missing item, or with no slot still
 * waits for Confirm & log.
 */
import { logger } from "../logger.js";
import { loggableError } from "../util/loggableError.js";
import { confirmMeal, type ActionContext } from "./actions.js";
import type { MealDraftCard } from "./chat.js";
import type { MealDraft } from "./meals.js";

/** Off switch, in case direct logging misbehaves: MAGNUS_QUICK_LOG=off. */
export function quickLogOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.MAGNUS_QUICK_LOG ?? "on").toLowerCase() !== "off";
}

/** Sure enough to log without asking: database numbers for every item, and a known meal. Pure. */
export function isConfidentDraft(d: MealDraft): boolean {
  return (
    d.estimated &&
    d.source === "food_db" &&
    d.items.length > 0 &&
    d.items.every((i) => !i.missing && i.calories >= 0) &&
    !d.slotUnsure &&
    d.slot !== "unspecified"
  );
}

/** Logs a draft now. Returns the card in its logged state, or null when the save failed (the draft card stays). */
export async function logDraftNow(
  ctx: ActionContext,
  draft: MealDraft,
  confirm: typeof confirmMeal = confirmMeal,
): Promise<MealDraftCard | null> {
  try {
    const r = await confirm(ctx, {
      draftId: draft.draftId,
      text: draft.text,
      slot: draft.slot,
      source: draft.source,
      items: draft.items.map(({ name, calories, protein_g, carbs_g, fat_g }) => ({ name, calories, protein_g, carbs_g, fat_g })),
      edited: false,
      ...(draft.date ? { date: draft.date } : {}),
      ...(draft.extra ? { extra: true } : {}),
    });
    if (!r.ok) {
      logger.warn({ err: r.error }, "quick log failed; left as a draft");
      return null;
    }
    return { type: "meal_draft", draft: { ...draft, autoLogged: true }, saved: { calories: Math.round(r.totals.calories) } };
  } catch (err) {
    logger.warn({ err: loggableError(err) }, "quick log failed; left as a draft");
    return null;
  }
}
