/**
 * Silent intent classification. The user always talks to Magnus; this decides whether a pillar
 * specialist writes the answer or Magnus handles it himself.
 */
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { parseIntent, type Intent } from "../intent.js";
import { anthropic } from "../tools/clients.js";
import { parseMealLogCommand } from "../meals/parseMealLogCommand.js";
import { looksLikeYoutubeAction } from "./tools/youtubeActionDetect.js";
import { looksLikeMagnusToolAction } from "./tools/magnusActionDetect.js";
import {
  looksLikeMagnusToolContinuation,
  type RoutingChatTurn,
} from "./routing/magnusToolContinuation.js";

const MODEL = "claude-sonnet-4-6";

const CLASSIFY_SYSTEM = `Classify a message to a personal assistant into exactly one category.

HEALTH — training, workouts, the gym, food and meals, nutrition, sleep, recovery, energy, injury,
body composition, or logging any of these.
WEALTH — money: budgeting, spending, saving, debt, net worth, investing, financial goals.
HAPPINESS — leisure and people: books, film, music for enjoyment, games, hobbies, creative
practice, rest, travel and trips, friends, family, relationships. Taste talk without acting on
YouTube / YT Music stays here.
WISDOM — getting better: learning something, courses, practice, career direction and growth,
skills, and shipping projects.
GENERAL — everything else, and specifically: the calendar and schedule, what the day or week
looks like, reminders, journaling and logging, YouTube / YT Music actions (search, playlists,
bookmarks, cue/queue, recommendations to open), user lists (watchlist, readlist, tasks, goals
catalog — read, add, update, recommend from saved items), LifeOS logging (joy tank, pillar
status, goals table), Notion connect/sync, event log (log/reschedule/list commitments), questions
spanning several categories, looking something up, and ordinary conversation.

When a message could fit two categories, choose the one the user is asking you to act on.
Reply with only the category name.`;

function textFromMessage(msg: Message): string {
  for (const block of msg.content) {
    if (block.type === "text") {
      return block.text;
    }
  }
  return "";
}

async function classifyIntent(userMessage: string): Promise<Intent> {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16,
    system: CLASSIFY_SYSTEM,
    messages: [{ role: "user", content: userMessage }],
  });
  return parseIntent(textFromMessage(msg));
}

/**
 * Classify, then apply deterministic corrections worth having:
 * - explicit meal log → HEALTH (even when the classifier reads it as small talk about food)
 * - YouTube / YT Music actions → GENERAL (Magnus has the tools; Happiness does not)
 * - list / LifeOS / Notion tool actions → GENERAL (pillar specialists are prompt-only)
 * - short continuations after a YouTube tool turn → GENERAL (pillar specialists have no tools)
 */
export async function resolveIntentNaturalLanguage(
  userMessage: string,
  options?: { recentTurns?: RoutingChatTurn[] },
): Promise<Intent> {
  const intent = await classifyIntent(userMessage);

  if (intent !== "HEALTH" && parseMealLogCommand(userMessage).kind === "meal") {
    return "HEALTH";
  }

  if (intent !== "GENERAL" && looksLikeYoutubeAction(userMessage)) {
    return "GENERAL";
  }

  if (intent !== "GENERAL" && looksLikeMagnusToolAction(userMessage)) {
    return "GENERAL";
  }

  if (
    intent !== "GENERAL" &&
    looksLikeMagnusToolContinuation(userMessage, options?.recentTurns ?? [])
  ) {
    return "GENERAL";
  }

  return intent;
}
