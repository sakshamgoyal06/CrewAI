/**
 * Meal drafts that start outside the coach model (a photo of the plate, a repeat of a usual meal)
 * but still land in the chat as the same editable card, so the thread shows everything logged.
 */
import { startMealDraft, type ActionContext } from "./actions.js";
import { mealDraftReply, recordChatTurn, type ChatReply } from "./chat.js";
import type { MealDraft } from "./meals.js";
import { readMealPhoto, type PhotoMealInput, type PhotoReading } from "./photoMeal.js";

export type PhotoMealResult =
  | ({ ok: true; seen: string } & ChatReply)
  | { ok: false; error: "not_food" | "unreadable"; message: string };

type Deps = {
  read?: (input: PhotoMealInput) => Promise<PhotoReading>;
  draft?: (ctx: ActionContext, input: { text: string; slot?: PhotoMealInput["slot"] }) => Promise<MealDraft>;
  record?: typeof recordChatTurn;
};

export function photoReplyText(seen: string, draft: MealDraft): string {
  return `Looks like ${seen}. ${mealDraftReply([draft])}`.trim();
}

export async function draftMealFromPhoto(
  ctx: ActionContext,
  input: PhotoMealInput,
  deps: Deps = {},
): Promise<PhotoMealResult> {
  const reading = await (deps.read ?? readMealPhoto)(input);
  if (!reading.ok) return reading;
  const draft = await (deps.draft ?? startMealDraft)(ctx, { text: reading.text, slot: input.slot });
  // The photo guess (portion, oil) matters more than the per-ingredient note, so it goes first.
  const why = [reading.assumption, draft.servingAssumption].filter(Boolean).join(" ");
  const withWhy: MealDraft = { ...draft, servingAssumption: why || null };
  const text = photoReplyText(reading.text, withWhy);
  const cards = [{ type: "meal_draft" as const, draft: withWhy }];
  await (deps.record ?? recordChatTurn)(ctx.userProfileId, input.note ? `📷 ${input.note}` : "📷 Meal photo", text, cards);
  return { ok: true, seen: reading.text, text, cards, changed: false };
}
