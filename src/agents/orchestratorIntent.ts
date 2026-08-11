/**
 * Silent intent classification. The user always talks to Magnus; this decides which pillar
 * executes the turn. Hints carry structural signals; the classifier interprets them.
 */
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { parseIntent, type Intent } from "../intent.js";
import { anthropic } from "../tools/clients.js";
import {
  buildIntentRoutingHints,
  type IntentRoutingHints,
} from "./routing/intentRoutingHints.js";
import type { RoutingChatTurn } from "./routing/magnusToolContinuation.js";

const MODEL = "claude-sonnet-4-6";

const CLASSIFY_SYSTEM = `Classify a message to a personal assistant into exactly one category.

HEALTH — training, workouts, the gym, food and meals, nutrition, sleep, recovery, energy, injury,
body composition, or logging any of these. Meal **plan** (future menu) and meal **log** (food eaten)
are separate stores — only logged meals count toward daily calories.
WEALTH — money: budgeting, spending, saving, debt, net worth, investing, financial goals.
HAPPINESS — leisure and people: books, film, music for enjoyment, games, hobbies, creative
practice, rest, travel and trips, friends, family, relationships. Taste talk without acting on
YouTube / YT Music stays here.
WISDOM — getting better: learning something, courses, practice, career direction and growth,
skills, and shipping projects.
GENERAL — everything else, and specifically: the calendar and schedule, **what the whole day or week
looks like** (calendar events, commitments, and meals together — not food alone), reminders,
journaling and logging, YouTube / YT Music actions (search, playlists, bookmarks, cue/queue,
recommendations to open), user lists (watchlist, readlist, tasks, goals catalog — read, add,
update, recommend from saved items), LifeOS logging (joy tank, pillar status, goals table), Notion
connect/sync, event log (log/reschedule/list commitments), questions spanning several categories,
looking something up, and ordinary conversation.

HEALTH does **not** own holistic day/schedule overviews ("what does tomorrow look like", "entire
day", "what's on my calendar tomorrow") — those are GENERAL even if food or meals could be part of
the answer.

Use routing_hints when present:
- explicit_meal_log or looks_like_meal_log_read → HEALTH (logging food eaten, or reading **logged** meal history/macros — never the meal **plan** menu)
- looks_like_youtube_action or looks_like_magnus_tool_action or looks_like_magnus_tool_continuation → GENERAL (Magnus has tools)
- looks_like_wealth_portfolio_read → WEALTH when asking to read/show portfolio (not a Magnus list action)
- looks_like_health_fitness_read → HEALTH when asking to read/review workouts or Hevy (not a Magnus tool action)

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

async function classifyIntent(
  userMessage: string,
  hints: IntentRoutingHints,
): Promise<Intent> {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16,
    system: CLASSIFY_SYSTEM,
    messages: [
      {
        role: "user",
        content: JSON.stringify({ message: userMessage.trim(), routing_hints: hints }, null, 2),
      },
    ],
  });
  return parseIntent(textFromMessage(msg));
}

/**
 * Classify with structural hints. Hard overrides: explicit meal-log command or meal-log read → HEALTH.
 */
export async function resolveIntentNaturalLanguage(
  userMessage: string,
  options?: { recentTurns?: RoutingChatTurn[] },
): Promise<Intent> {
  const hints = buildIntentRoutingHints(userMessage, options?.recentTurns ?? []);

  if (hints.explicit_meal_log || hints.looks_like_meal_log_read) {
    return "HEALTH";
  }

  return classifyIntent(userMessage, hints);
}
