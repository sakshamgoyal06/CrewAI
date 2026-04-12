/**
 * MAGNUS — orchestrator agent: wires agents, tools, memory, and scheduler.
 */
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { parseIntent, type Intent } from "./intent.js";
import { logger, maskTelegramUserId } from "./logger.js";
import { loggableError } from "./util/loggableError.js";
import { anthropic } from "./tools/clients.js";
import {
  recordMagnusChatMessage,
  resolveTelegramUserProfile,
} from "./tools/chatLog.js";

const MODEL = "claude-sonnet-4-6";

const CLASSIFY_SYSTEM = `You are MAGNUS, a personal AI chief of staff. Classify the intent of the user message into exactly one category:
HEALTH | WEALTH | BUILD | PLANNING | RELATIONSHIPS | LEARNING | HAPPINESS | GENERAL
Reply with only the category name, nothing else.`;

const GENERAL_SYSTEM =
  "You are MAGNUS, a warm and direct personal AI chief of staff for Saksham. Keep replies under 100 words.";

const NOT_ALLOWLISTED_REPLY =
  "You're not allowlisted to use Magnus yet. Ask an admin to enable your account.";

const TIER_NO_CHAT_REPLY =
  "Your access tier doesn't include chat right now. We'll expand this soon.";

function textFromMessage(msg: Message): string {
  for (const block of msg.content) {
    if (block.type === "text") {
      return block.text;
    }
  }
  return "";
}

function routingPlaceholder(intent: Exclude<Intent, "GENERAL">): string {
  return `🧠 MAGNUS routing to ${intent} department... (agents coming soon)`;
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

async function answerGeneral(userMessage: string): Promise<string> {
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: GENERAL_SYSTEM,
    messages: [{ role: "user", content: userMessage }],
  });
  return textFromMessage(msg).trim() || "…";
}

function chatAllowed(accessFlags: Record<string, unknown>): boolean {
  if (accessFlags.chat === false) {
    return false;
  }
  return true;
}

export type MagnusRuntime = {
  start(): void;
};

export function createMagnus(): MagnusRuntime {
  return {
    start() {
      // TODO: boot orchestration (agents, webhooks, cron, etc.)
    },
  };
}

export async function handleMessage(
  userMessage: string,
  telegramUserId: string,
  updateId?: number,
): Promise<string> {
  const log = logger.child({
    module: "magnus",
    updateId: updateId ?? null,
    telegramUserId: maskTelegramUserId(telegramUserId),
  });

  const user = await resolveTelegramUserProfile(telegramUserId);

  if (!user.allowlisted) {
    return NOT_ALLOWLISTED_REPLY;
  }

  if (!chatAllowed(user.accessFlags)) {
    return TIER_NO_CHAT_REPLY;
  }

  const metaBase = {
    telegram_user_id: user.telegramUserId,
    user_tier: user.userTier,
    access_flags: user.accessFlags,
  };

  const userLog = await recordMagnusChatMessage({
    user_profile_id: user.profileId,
    telegram_user_id: user.telegramUserId,
    role: "user",
    content: userMessage,
    source: "telegram",
    metadata: metaBase,
  });
  if (!userLog.ok) {
    log.warn({ err: userLog.error }, "user message not persisted to chat log");
  }

  try {
    const intent = await classifyIntent(userMessage);
    const replyText =
      intent === "GENERAL"
        ? await answerGeneral(userMessage)
        : routingPlaceholder(intent);

    const asstLog = await recordMagnusChatMessage({
      user_profile_id: user.profileId,
      telegram_user_id: user.telegramUserId,
      role: "assistant",
      content: replyText,
      source: "telegram",
      intent,
      metadata: metaBase,
    });
    if (!asstLog.ok) {
      log.warn({ err: asstLog.error }, "assistant reply not persisted to chat log");
    }

    return replyText;
  } catch (err) {
    log.error({ err: loggableError(err) }, "handleMessage failed");
    const fallback = "Something went wrong. Check server logs.";
    const errLog = await recordMagnusChatMessage({
      user_profile_id: user.profileId,
      telegram_user_id: user.telegramUserId,
      role: "assistant",
      content: fallback,
      source: "telegram",
      intent: "error",
      metadata: metaBase,
    });
    if (!errLog.ok) {
      log.warn({ err: errLog.error }, "error fallback not persisted to chat log");
    }
    return fallback;
  }
}
