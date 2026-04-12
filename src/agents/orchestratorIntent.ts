/**
 * Natural-language intent resolution for {@link runOrchestratorReply}:
 * classify → optional coercions → research heuristic (no slash commands).
 */
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { parseIntent, type Intent } from "../intent.js";
import { anthropic } from "../tools/clients.js";
import { isResearchSubIntent } from "./intelligence/researchRouting.js";
import { isNotionIntentOverride } from "./knowledge/notionIntent.js";
import { parseMealLogCommand } from "../meals/parseMealLogCommand.js";

const MODEL = "claude-sonnet-4-6";

const CLASSIFY_SYSTEM = `You are MAGNUS, a personal AI chief of staff. Classify the intent of the user message into exactly one category:
HEALTH | WEALTH | BUILD | PLANNING | RELATIONSHIPS | LEARNING | HAPPINESS | CULTURE | NOTION | GENERAL
Use NOTION when the user wants to log, create, or query something in Notion (pages, Goals DB, check-ins, patterns, briefs).
Use CULTURE when the user wants **recommendations** for books, films, series, poetry, or other arts keyed to mood, taste, or what to read/watch next (not travel planning — that is HAPPINESS).
Use GENERAL when the user asks to research, compare, summarize, or look up external information (even if the topic touches planning or wealth).
Reply with only the category name, nothing else.`;

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
    max_tokens: 64,
    system: CLASSIFY_SYSTEM,
    messages: [{ role: "user", content: userMessage }],
  });
  return parseIntent(textFromMessage(msg));
}

/**
 * Full Magnus cycle for **non-slash** text: LLM classify, then deterministic fixes so
 * strong Notion / meal prefixes and research phrasing land in the right department.
 */
export async function resolveIntentNaturalLanguage(userMessage: string): Promise<Intent> {
  let intent = await classifyIntent(userMessage);

  if (intent === "GENERAL" && isNotionIntentOverride(userMessage)) {
    intent = "NOTION";
  }

  if (intent === "GENERAL" && parseMealLogCommand(userMessage).kind === "meal") {
    intent = "HEALTH";
  }

  if (
    intent !== "NOTION" &&
    intent !== "HEALTH" &&
    isResearchSubIntent(userMessage)
  ) {
    intent = "GENERAL";
  }

  return intent;
}
