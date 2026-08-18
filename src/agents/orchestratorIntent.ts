/**
 * Silent intent classification. The user always talks to Magnus; this decides which pillar
 * executes the turn. Hints carry structural signals; the classifier interprets them.
 */
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { parseIntent, type Intent } from "../intent.js";
import { anthropic } from "../tools/clients.js";
import {
  isMealLogConfirmationNo,
  isMealLogConfirmationYes,
} from "../meals/mealLogPending.js";
import {
  buildIntentRoutingHints,
  type IntentRoutingHints,
} from "./routing/intentRoutingHints.js";
import type { RoutingChatTurn } from "./routing/magnusToolContinuation.js";
import {
  formatRoutingContextForClassifier,
  type RoutingContext,
} from "./context/index.js";

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
- holistic_day_ask → GENERAL (whole-day schedule: calendar + commitments + meals — use day_overview, not meal plan alone)
- saved_media_pick → GENERAL (pick from saved playlist/watchlist for treadmill/gym — not taste coaching in HAPPINESS)
- schedule_accuracy_challenge → GENERAL (user disputes schedule — read calendar, do not guess)
- compound_action → GENERAL (multiple distinct asks in one message — multi-step plan: calendar + youtube, gym + meal plan, etc.)
- looks_like_wealth_portfolio_read → WEALTH when asking to read/show portfolio (not a Magnus list action)
- looks_like_health_fitness_read → HEALTH when asking to read/review workouts or Hevy (not a Magnus tool action)

routing_context (when present) — use with the message:
- pending.meal_log_confirm → short "yes"/"no" is meal logging, not new topic → HEALTH on yes
- pending.reversible_undo → "undo"/"yes" refers to last write → GENERAL (Magnus tools)
- pending.project_session → planning language or lock-in → GENERAL
- pending.meal_plan_session → meal plan edits → HEALTH
- recent_turns[].tools_used / delegated_agent → continuations ("yes", "add both") → GENERAL if prior turn used Magnus tools
- integrations → if calendar not connected and user challenges schedule, GENERAL connect path not HEALTH
- active_work.active_projects → status questions may be GENERAL project_status
- standing.routing_facts / program_notes → honor avoid lists and meal rules when classifying food messages → HEALTH

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
  routingContext?: RoutingContext,
): Promise<Intent> {
  const payload: Record<string, unknown> = {
    message: userMessage.trim(),
    routing_hints: hints,
  };
  if (routingContext) {
    payload.routing_context = formatRoutingContextForClassifier(routingContext);
  }

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16,
    system: CLASSIFY_SYSTEM,
    messages: [
      {
        role: "user",
        content: JSON.stringify(payload, null, 2),
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
  options?: { recentTurns?: RoutingChatTurn[]; routingContext?: RoutingContext },
): Promise<Intent> {
  const hints =
    options?.routingContext?.routingHints ??
    buildIntentRoutingHints(userMessage, options?.recentTurns ?? []);

  const pending = options?.routingContext?.pending;

  if (pending?.mealLogConfirm) {
    if (isMealLogConfirmationYes(userMessage)) {
      return "HEALTH";
    }
    if (isMealLogConfirmationNo(userMessage)) {
      return "GENERAL";
    }
  }

  if (hints.explicit_meal_log || hints.looks_like_meal_log_read) {
    return "HEALTH";
  }

  if (
    pending?.mealPlanSession &&
    /\b(meal\s+plan|breakfast|lunch|dinner|snack|swap|change|lock|plan)\b/i.test(userMessage)
  ) {
    return "HEALTH";
  }

  return classifyIntent(userMessage, hints, options?.routingContext);
}
