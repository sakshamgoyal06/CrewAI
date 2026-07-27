/**
 * Silent intent classification. The user always talks to Magnus; this decides whether a pillar
 * specialist writes the answer or Magnus handles it himself.
 */
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { parseIntent, type Intent } from "../intent.js";
import { anthropic } from "../tools/clients.js";
import { parseMealLogCommand } from "../meals/parseMealLogCommand.js";

const MODEL = "claude-sonnet-4-6";

const CLASSIFY_SYSTEM = `Classify a message to a personal assistant into exactly one category.

HEALTH — training, workouts, the gym, food and meals, nutrition, sleep, recovery, energy, injury,
body composition, or logging any of these.
WEALTH — money: budgeting, spending, saving, debt, net worth, investing, financial goals.
HAPPINESS — leisure and people: books, film, music for enjoyment, games, hobbies, creative
practice, rest, travel and trips, friends, family, relationships.
WISDOM — getting better: learning something, courses, practice, career direction and growth,
skills, and shipping projects.
GENERAL — everything else, and specifically: the calendar and schedule, what the day or week
looks like, reminders, journaling and logging, questions spanning several categories, looking
something up, and ordinary conversation.

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
 * Classify, then apply the one deterministic correction worth having: an explicit meal log is
 * health work even when the classifier reads it as small talk about food.
 */
export async function resolveIntentNaturalLanguage(userMessage: string): Promise<Intent> {
  const intent = await classifyIntent(userMessage);

  if (intent !== "HEALTH" && parseMealLogCommand(userMessage).kind === "meal") {
    return "HEALTH";
  }

  return intent;
}
