/**
 * Where the app's own check-ins land in the chat, so they read as one conversation rather than a
 * pile of notifications.
 *
 * A check (routine item not logged, no Hevy workout after the gym slot) is posted as an assistant
 * row with no user row. When the person has not replied since the last one for the same item,
 * the new date joins that message instead of starting another; and once a few check-ins are
 * waiting unanswered, new ones fold into the latest instead of stacking further. Every date keeps
 * its own card, so each can still be answered on its own.
 */
import { supabase } from "../tools/clients.js";
import { logger } from "../logger.js";
import type { ChatCard } from "./chat.js";
import { hydrateCard, loadCardStates } from "./chatCards.js";
import { postCoachMessage } from "./workoutCheckStore.js";

/** Unanswered app messages allowed before new ones fold into the latest. */
export const MAX_UNANSWERED = 3;
const TAIL = 12;

export type CheckCard = Extract<ChatCard, { type: "routine_check" | "workout_check" }>;

type Row = { id: string; role: string; content: string; cards: ChatCard[] | null; turn_id: string | null };

/** What ties a check to its item: one unanswered message per routine item, one for the gym. */
export function checkKeyOf(card: ChatCard): string | null {
  if (card.type === "routine_check") return `routine_check:${card.itemId}`;
  if (card.type === "workout_check") return "workout_check";
  return null;
}

const day = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  const f = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-GB", { ...o, timeZone: "UTC" });
  return `${f({ weekday: "short" })} ${f({ day: "numeric" })} ${f({ month: "short" })}`;
};

const list = (dates: string[]) => {
  const d = [...new Set(dates)].sort().map(day);
  return d.length <= 1 ? d.join("") : `${d.slice(0, -1).join(", ")} and ${d[d.length - 1]}`;
};

/** The text for several open dates of one item. */
export function mergedCheckText(cards: CheckCard[]): string {
  const dates = cards.map((c) => c.date);
  const first = cards[0]!;
  if (first.type === "routine_check") {
    return `${first.label}: nothing logged for ${list(dates)}. Did you get them in? Answer each below.`;
  }
  return `No Hevy workout after your gym slot on ${list(dates)}. Trained and didn't log, or skipped? Answer each below.`;
}

/** The text when check-ins have piled up and a new one folds into the latest message. */
export function catchUpText(open: CheckCard[]): string {
  const items = [...new Set(open.map((c) => (c.type === "routine_check" ? c.label.toLowerCase() : "the gym")))];
  return `A few check-ins piled up while you were away: ${list2(items)}. Answer the ones below when you can, or just tell me what happened.`;
}

const list2 = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export type PostCheckResult = { action: "posted" | "merged" | "folded"; rowId: string | null };

/**
 * Posts a check into the chat, merging with the unanswered message for the same item, or folding
 * into the latest unanswered message once too many are waiting. `text` is used for a fresh post.
 */
export async function postCheck(userProfileId: string, text: string, card: CheckCard): Promise<PostCheckResult> {
  const key = checkKeyOf(card)!;
  let stack: Row[] = [];
  try {
    stack = await unansweredStack(userProfileId);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "check-in stack read failed; posting plainly");
  }
  if (!stack.length) return posted(userProfileId, text, card);

  const allCards = stack.flatMap((r) => r.cards ?? []);
  const states = await loadCardStates(userProfileId, allCards).catch(() => null);
  const stillOpen = (c: ChatCard): c is CheckCard => {
    const h = states ? hydrateCard(c, states) : c;
    return (h.type === "routine_check" || h.type === "workout_check") && h.status === "missing";
  };

  const sameItem = stack.find((r) => (r.cards ?? []).some((c) => checkKeyOf(c) === key && stillOpen(c)));
  if (sameItem) {
    const cards = [...(sameItem.cards ?? []), card];
    const open = cards.filter(stillOpen);
    return update(sameItem.id, mergedCheckText(open), cards, "merged");
  }
  if (stack.length >= MAX_UNANSWERED) {
    const latest = stack[0]!;
    const cards = [...(latest.cards ?? []), card];
    const open = [...allCards.filter(stillOpen), card];
    return update(latest.id, catchUpText(open), cards, "folded");
  }
  return posted(userProfileId, text, card);
}

async function posted(userProfileId: string, text: string, card: CheckCard): Promise<PostCheckResult> {
  await postCoachMessage(userProfileId, text, [card]);
  return { action: "posted", rowId: null };
}

async function update(id: string, content: string, cards: ChatCard[], action: "merged" | "folded"): Promise<PostCheckResult> {
  const { error } = await supabase
    .from("health_chat_messages")
    .update({ content, cards, created_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    logger.warn({ error: error.message }, "check-in merge failed");
    return { action, rowId: null };
  }
  return { action, rowId: id };
}

/** The app's own messages since the person last wrote, newest first. */
async function unansweredStack(userProfileId: string): Promise<Row[]> {
  const { data, error } = await supabase
    .from("health_chat_messages")
    .select("id, role, content, cards, turn_id")
    .eq("user_profile_id", userProfileId)
    .order("created_at", { ascending: false })
    .limit(TAIL);
  if (error) throw new Error(error.message);
  const stack: Row[] = [];
  for (const r of (data ?? []) as Row[]) {
    if (r.role !== "assistant" || r.turn_id) break;
    stack.push(r);
  }
  return stack;
}
