/**
 * Routing context parser — LLM sub-agent for structural signals (no regex routing).
 *
 * Replaces conversationSignals, magnusActionDetect, youtubeActionDetect,
 * magnusToolContinuation, and pillarConsultationSignals for routing hints.
 */
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { anthropic } from "../../tools/clients.js";
import { logger } from "../../logger.js";
import { loggableError } from "../../util/loggableError.js";
import type { ConsultablePillarIntent } from "./pillarConsultationSignals.js";
import type { RoutingChatTurn } from "./magnusToolContinuation.js";

const PARSER_MODEL = process.env.MAGNUS_ROUTING_PARSER_MODEL?.trim() || "claude-haiku-4-5";

const GENERAL_CAPABILITIES = [
  "calendar",
  "youtube",
  "lists",
  "event_log",
  "journal",
  "proactive",
  "lifeos",
  "notion",
  "connect",
] as const;

export type MagnusRoutingCapability = (typeof GENERAL_CAPABILITIES)[number];

export type RoutingContextSignals = {
  explicit_meal_log: boolean;
  looks_like_meal_log_read: boolean;
  looks_like_youtube_action: boolean;
  looks_like_magnus_tool_action: boolean;
  looks_like_magnus_tool_continuation: boolean;
  looks_like_health_fitness_read: boolean;
  looks_like_wealth_portfolio_read: boolean;
  holistic_day_ask: boolean;
  saved_media_pick: boolean;
  schedule_accuracy_challenge: boolean;
  compound_action: boolean;
  /** Orchestrator may coerce to HEALTH before top-level classifier (meal reads, slot follow-ups). */
  prefer_intent_health: boolean;
  consult_pillars: ConsultablePillarIntent[];
  magnus_capabilities: MagnusRoutingCapability[];
};

export const NEUTRAL_ROUTING_CONTEXT: RoutingContextSignals = {
  explicit_meal_log: false,
  looks_like_meal_log_read: false,
  looks_like_youtube_action: false,
  looks_like_magnus_tool_action: false,
  looks_like_magnus_tool_continuation: false,
  looks_like_health_fitness_read: false,
  looks_like_wealth_portfolio_read: false,
  holistic_day_ask: false,
  saved_media_pick: false,
  schedule_accuracy_challenge: false,
  compound_action: false,
  prefer_intent_health: false,
  consult_pillars: [],
  magnus_capabilities: [],
};

const ROUTING_PARSER_SYSTEM = `You are the **routing context parser** for Magnus (personal Telegram chief of staff).

You receive the current user message and recent chat previews. Output **only** JSON — boolean signals and capability lists. You do NOT execute tools.

## Intent classifier hints (booleans)

- **explicit_meal_log**: true only for explicit command forms: "meal:", "/meal", "log meal:", "log breakfast:", "ate:", "just had:".
- **looks_like_meal_log_read**: user wants **logged** meal history, macros, breakdown, or undo — NOT the meal **plan** menu.
- **looks_like_youtube_action**: YouTube / YT Music actions (search, playlist, bookmark, cue, connect Google/YouTube) or a YouTube/YT Music URL.
- **looks_like_magnus_tool_action**: Magnus operations tools needed now: lists (watchlist/readlist/tasks), LifeOS (joy tank, pillar status, goals), Notion connect/sync, event log, proactive reminders, calendar writes/reads/deletes.
- **looks_like_magnus_tool_continuation**: short affirmative follow-up ("yes", "do it", "go ahead") continuing a Magnus tool offer from the last assistant turn.
- **looks_like_health_fitness_read**: read/review workouts, Hevy, gym session data (not logging food).
- **looks_like_wealth_portfolio_read**: read portfolio, holdings, Zerodha/Kite, SIPs (not Magnus list actions).
- **holistic_day_ask**: user wants the **whole day** woven together (calendar + commitments + meals) — e.g. "what does tomorrow look like", "walk me through my day".
- **saved_media_pick**: pick from saved playlist/watchlist for an activity (treadmill, gym) — not open-ended taste coaching.
- **schedule_accuracy_challenge**: true ONLY when the user **disputes** schedule accuracy ("you're not looking at the calendar", "that wrong", "didn't check calendar"). **FALSE** when they ask to check, clean, delete, or manage calendar events — those are magnus_tool_action + calendar capability.
- **compound_action**: multiple distinct asks in one message ("add to calendar AND suggest a video").
- **prefer_intent_health**: true when HEALTH should win before the five-way classifier: meal slot follow-up after meal context, meal day breakdown, explicit meal log command, meal slot correction.

## Pillar consultation

- **consult_pillars**: subset of ["HEALTH","WEALTH","HAPPINESS","WISDOM"] when the message needs specialist depth alongside Magnus tools in one reply. Empty when not needed.

## Magnus capabilities for tool filtering

- **magnus_capabilities**: subset of ${JSON.stringify(GENERAL_CAPABILITIES)} implied by this message. Examples:
  - calendar bulk read/delete/create → ["calendar"]
  - remind me at 9am → ["proactive"]
  - add to watchlist → ["lists"]
  - connect notion → ["notion","connect"]

Use **recent_turns** for follow-ups. Interpret meaning; do not keyword-match.

Output shape:
{"explicit_meal_log":false,"looks_like_meal_log_read":false,"looks_like_youtube_action":false,"looks_like_magnus_tool_action":false,"looks_like_magnus_tool_continuation":false,"looks_like_health_fitness_read":false,"looks_like_wealth_portfolio_read":false,"holistic_day_ask":false,"saved_media_pick":false,"schedule_accuracy_challenge":false,"compound_action":false,"prefer_intent_health":false,"consult_pillars":[],"magnus_capabilities":[]}`;

function textFromMessage(msg: Message): string {
  for (const block of msg.content) {
    if (block.type === "text") {
      return block.text;
    }
  }
  return "";
}

function asBool(value: unknown): boolean {
  return value === true;
}

function parseCapabilities(raw: unknown): MagnusRoutingCapability[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const allowed = new Set<string>(GENERAL_CAPABILITIES);
  const out: MagnusRoutingCapability[] = [];
  for (const item of raw) {
    const id = typeof item === "string" ? item.trim() : "";
    if (id && allowed.has(id) && !out.includes(id as MagnusRoutingCapability)) {
      out.push(id as MagnusRoutingCapability);
    }
  }
  return out;
}

function parseConsultPillars(raw: unknown): ConsultablePillarIntent[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: ConsultablePillarIntent[] = [];
  for (const item of raw) {
    const id = typeof item === "string" ? item.trim().toUpperCase() : "";
    if (
      id === "HEALTH" ||
      id === "WEALTH" ||
      id === "HAPPINESS" ||
      id === "WISDOM"
    ) {
      const pillar = id as ConsultablePillarIntent;
      if (!out.includes(pillar)) {
        out.push(pillar);
      }
    }
  }
  return out;
}

function parseRoutingJson(text: string): RoutingContextSignals | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const raw = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    return {
      explicit_meal_log: asBool(raw.explicit_meal_log),
      looks_like_meal_log_read: asBool(raw.looks_like_meal_log_read),
      looks_like_youtube_action: asBool(raw.looks_like_youtube_action),
      looks_like_magnus_tool_action: asBool(raw.looks_like_magnus_tool_action),
      looks_like_magnus_tool_continuation: asBool(raw.looks_like_magnus_tool_continuation),
      looks_like_health_fitness_read: asBool(raw.looks_like_health_fitness_read),
      looks_like_wealth_portfolio_read: asBool(raw.looks_like_wealth_portfolio_read),
      holistic_day_ask: asBool(raw.holistic_day_ask),
      saved_media_pick: asBool(raw.saved_media_pick),
      schedule_accuracy_challenge: asBool(raw.schedule_accuracy_challenge),
      compound_action: asBool(raw.compound_action),
      prefer_intent_health: asBool(raw.prefer_intent_health),
      consult_pillars: parseConsultPillars(raw.consult_pillars),
      magnus_capabilities: parseCapabilities(raw.magnus_capabilities),
    };
  } catch {
    return null;
  }
}

export type RoutingContextInput = {
  userMessage: string;
  recentTurns?: RoutingChatTurn[];
};

/**
 * Parse routing signals for one turn via LLM (Haiku). Falls back to neutral signals on failure.
 */
export async function parseRoutingContext(input: RoutingContextInput): Promise<RoutingContextSignals> {
  const recent = (input.recentTurns ?? []).slice(-6).map((t) => ({
    role: t.role === "assistant" ? ("assistant" as const) : ("user" as const),
    preview: t.content.slice(0, 280),
  }));

  const payload = JSON.stringify(
    {
      message: input.userMessage.trim(),
      recent_turns: recent,
    },
    null,
    2,
  );

  try {
    const msg = await anthropic.messages.create({
      model: PARSER_MODEL,
      max_tokens: 384,
      system: ROUTING_PARSER_SYSTEM,
      messages: [{ role: "user", content: payload }],
    });
    const parsed = parseRoutingJson(textFromMessage(msg));
    if (parsed) {
      return parsed;
    }
    logger.warn({ module: "routingContextParser" }, "routing parser returned unparseable JSON");
  } catch (e) {
    logger.warn(
      { module: "routingContextParser", err: loggableError(e) },
      "routing context parser failed",
    );
  }

  return { ...NEUTRAL_ROUTING_CONTEXT };
}

/** Subset passed to the five-way intent classifier. */
export function routingContextToIntentHints(
  signals: RoutingContextSignals,
): import("./intentRoutingHints.js").IntentRoutingHints {
  return {
    explicit_meal_log: signals.explicit_meal_log,
    looks_like_meal_log_read: signals.looks_like_meal_log_read,
    looks_like_youtube_action: signals.looks_like_youtube_action,
    looks_like_magnus_tool_action: signals.looks_like_magnus_tool_action,
    looks_like_magnus_tool_continuation: signals.looks_like_magnus_tool_continuation,
    looks_like_health_fitness_read: signals.looks_like_health_fitness_read,
    looks_like_wealth_portfolio_read: signals.looks_like_wealth_portfolio_read,
    holistic_day_ask: signals.holistic_day_ask,
    saved_media_pick: signals.saved_media_pick,
    schedule_accuracy_challenge: signals.schedule_accuracy_challenge,
    compound_action: signals.compound_action,
  };
}
