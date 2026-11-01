/**
 * LLM parser for activity completion replies — done / missed / postpone / skip.
 */
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { anthropic } from "../tools/clients.js";
import { logger } from "../logger.js";
import { loggableError } from "../util/loggableError.js";
import type { ActivityCompletionOutcome } from "./activityCompletionPending.js";

const PARSER_MODEL = process.env.MAGNUS_ACTIVITY_COMPLETION_PARSER_MODEL?.trim() || "claude-haiku-4-5";

export type ActivityCompletionParseResult = {
  outcome: ActivityCompletionOutcome | "decline" | "unknown";
  note?: string;
  /** Natural-language time for postpone, e.g. "tomorrow 8am". */
  new_start_phrase?: string;
  confidence: number;
};

const NEUTRAL: ActivityCompletionParseResult = {
  outcome: "unknown",
  confidence: 0,
};

function textFromMessage(msg: Message): string {
  for (const block of msg.content) {
    if (block.type === "text") {
      return block.text;
    }
  }
  return "";
}

function parseJson(text: string): ActivityCompletionParseResult | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const raw = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    const outcomeRaw = typeof raw.outcome === "string" ? raw.outcome.trim().toLowerCase() : "";
    const allowed = new Set(["done", "missed", "skipped", "postponed", "decline", "unknown"]);
    const outcome = allowed.has(outcomeRaw)
      ? (outcomeRaw as ActivityCompletionParseResult["outcome"])
      : "unknown";
    const confidence =
      typeof raw.confidence === "number" && Number.isFinite(raw.confidence)
        ? Math.min(1, Math.max(0, raw.confidence))
        : 0.5;
    const note =
      typeof raw.note === "string" && raw.note.trim() ? raw.note.trim().slice(0, 500) : undefined;
    const new_start_phrase =
      typeof raw.new_start_phrase === "string" && raw.new_start_phrase.trim()
        ? raw.new_start_phrase.trim().slice(0, 120)
        : undefined;
    return { outcome, note, new_start_phrase, confidence };
  } catch {
    return null;
  }
}

const SYSTEM = `You parse a user's reply about whether they completed a planned activity.

Output JSON only:
{"outcome":"done"|"missed"|"skipped"|"postponed"|"decline"|"unknown","note":"optional short note","new_start_phrase":"only for postpone — natural time like tomorrow 8am","confidence":0.0-1.0}

Rules:
- done: completed, finished, did it, went, attended
- missed: didn't do, forgot, no show, couldn't make it (without new time)
- skipped: intentionally skipped, taking rest, not doing it today
- postponed: moved to another time — extract new_start_phrase when given
- decline: user wants to stop being asked about this check-in now
- unknown: unclear — ask again
- Interpret meaning; do not keyword-match blindly.`;

export async function parseActivityCompletionReply(input: {
  message: string;
  eventTitle: string;
  timeZone: string;
}): Promise<ActivityCompletionParseResult> {
  const message = input.message.trim();
  if (!message) {
    return NEUTRAL;
  }

  try {
    const msg = await anthropic.messages.create({
      model: PARSER_MODEL,
      max_tokens: 200,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: JSON.stringify(
            {
              activity: input.eventTitle,
              timezone: input.timeZone,
              message,
            },
            null,
            2,
          ),
        },
      ],
    });
    const parsed = parseJson(textFromMessage(msg));
    return parsed ?? NEUTRAL;
  } catch (e) {
    logger.warn(
      { err: loggableError(e), module: "activityCompletionParser" },
      "activity completion parse failed",
    );
    return NEUTRAL;
  }
}
