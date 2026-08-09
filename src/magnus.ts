/**
 * MAGNUS — the turn handler: access gates, chat persistence, and the orchestrator call.
 *
 * One user message produces exactly one Magnus reply (chunked only when Telegram's size limit
 * demands it). Nothing here tells the user which specialist ran; that is internal detail recorded
 * in chat metadata.
 */
import { runOrchestratorReply } from "./agents/magnusOrchestrator.js";
import { runPostTurnMemoryMaintenance } from "./agents/memory/memoryAgent.js";
import { scheduleProactiveCron } from "./proactive/cron.js";
import { splitPlainForTelegram } from "./magnus/telegramChunk.js";
import { markdownishToTelegramHtml } from "./magnus/telegramFormat.js";
import { logger, maskTelegramUserId } from "./logger.js";
import { loggableError } from "./util/loggableError.js";
import {
  conversationChatFields,
} from "./tools/chatMessageTypes.js";
import {
  recordMagnusChatMessage,
  resolveTelegramUserProfile,
} from "./tools/chatLog.js";

const NOT_ALLOWLISTED_REPLY =
  "You're not allowlisted to use Magnus yet. Ask an admin to enable your account.";

const TIER_NO_CHAT_REPLY =
  "Your access tier doesn't include chat right now. We'll expand this soon.";

function chatAllowed(accessFlags: Record<string, unknown>): boolean {
  return accessFlags.chat !== false;
}

function toTelegramHtml(text: string): string {
  return markdownishToTelegramHtml(text);
}

function plainChunksToTelegramHtml(plain: string): string[] {
  return splitPlainForTelegram(plain).map((p) => markdownishToTelegramHtml(p));
}

function turnTimeoutMs(): number {
  const raw = process.env.MAGNUS_TURN_TIMEOUT_MS;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isNaN(n) || n < 30_000) {
    return 240_000;
  }
  return n;
}

async function runOrchestratorWithTimeout(input: Parameters<typeof runOrchestratorReply>[0]) {
  const timeoutMs = turnTimeoutMs();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      runOrchestratorReply(input),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("turn_timeout"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export type MagnusRuntime = {
  start(): void;
};

export function createMagnus(): MagnusRuntime {
  return {
    start() {
      // Magnus-initiated Telegram messages (morning brief, event reminders, …).
      scheduleProactiveCron();
    },
  };
}

export type HandleMessageOptions = {
  updateId?: number;
  /** Telegram "typing…" indicator, refreshed while the turn runs. */
  sendTyping?: () => void | Promise<void>;
  /** Meal photo from Telegram for vision logging. */
  mealPhoto?: { fileId: string; caption?: string | null };
};

/** Outbound Telegram payloads in send order (HTML via `markdownishToTelegramHtml`). */
export type HandleMessageResult = string[];

export async function handleMessage(
  userMessage: string,
  telegramUserId: string,
  options?: HandleMessageOptions,
): Promise<HandleMessageResult> {
  const { updateId, sendTyping } = options ?? {};

  const log = logger.child({
    module: "magnus",
    updateId: updateId ?? null,
    telegramUserId: maskTelegramUserId(telegramUserId),
  });

  const user = await resolveTelegramUserProfile(telegramUserId);

  if (!user.allowlisted) {
    return [toTelegramHtml(NOT_ALLOWLISTED_REPLY)];
  }
  if (!chatAllowed(user.accessFlags)) {
    return [toTelegramHtml(TIER_NO_CHAT_REPLY)];
  }

  const metaBase = {
    telegram_user_id: user.telegramUserId,
    user_tier: user.userTier,
    access_flags: user.accessFlags,
  };

  const conversationFields = conversationChatFields();

  const userLog = await recordMagnusChatMessage({
    user_profile_id: user.profileId,
    telegram_user_id: user.telegramUserId,
    role: "user",
    content: userMessage,
    source: "telegram",
    message_type: conversationFields.message_type,
    delivery_trigger: conversationFields.delivery_trigger,
    metadata: metaBase,
  });
  if (!userLog.ok) {
    log.warn({ err: userLog.error }, "user message not persisted to chat log");
  }

  let typingInterval: ReturnType<typeof setInterval> | undefined;
  if (sendTyping) {
    void Promise.resolve(sendTyping()).catch(() => {});
    typingInterval = setInterval(() => {
      void Promise.resolve(sendTyping()).catch(() => {});
    }, 4500);
  }

  try {
    const orchestrated = await runOrchestratorWithTimeout({
      userMessage,
      userProfileId: user.profileId,
      telegramUserId: user.telegramUserId,
      timezone: user.timezone,
      northStarGoal: user.northStarGoal,
      displayName: user.displayName,
      mealPhoto: options?.mealPhoto,
    });

    const { replyText, intent } = orchestrated;
    const intentForLog =
      orchestrated.agentMetadata?.meal_log === true ? "meal_log" : intent;

    const asstLog = await recordMagnusChatMessage({
      user_profile_id: user.profileId,
      telegram_user_id: user.telegramUserId,
      role: "assistant",
      content: replyText,
      source: "telegram",
      intent: intentForLog,
      message_type: conversationFields.message_type,
      delivery_trigger: conversationFields.delivery_trigger,
      metadata: {
        ...metaBase,
        ...(orchestrated.delegatedAgent !== undefined
          ? { delegated_agent: orchestrated.delegatedAgent }
          : {}),
        ...(orchestrated.agentMetadata !== undefined
          ? { agent_metadata: orchestrated.agentMetadata }
          : {}),
      },
    });
    if (!asstLog.ok) {
      log.warn({ err: asstLog.error }, "assistant reply not persisted to chat log");
    }

    if (orchestrated.memoryPackageChronologicalTurns) {
      void runPostTurnMemoryMaintenance({
        userProfileId: user.profileId,
        userMessage,
        assistantReply: replyText,
        chronologicalTurns: orchestrated.memoryPackageChronologicalTurns,
      }).catch(() => {});
    }

    const htmlChunks = plainChunksToTelegramHtml(replyText?.trim() || "…").filter(
      (c) => c.trim().length > 0,
    );
    return htmlChunks.length > 0 ? htmlChunks : [toTelegramHtml("…")];
  } catch (err) {
    log.error({ err: loggableError(err) }, "handleMessage failed");
    const timedOut =
      err instanceof Error &&
      (err.message.includes("turn_timeout") || err.name === "AbortError");
    const fallback = timedOut
      ? "That took too long. Try again, or say **cancel planning** if you were mid meal-plan."
      : "Something went wrong. Check server logs.";
    const errLog = await recordMagnusChatMessage({
      user_profile_id: user.profileId,
      telegram_user_id: user.telegramUserId,
      role: "assistant",
      content: fallback,
      source: "telegram",
      intent: "error",
      message_type: conversationFields.message_type,
      delivery_trigger: conversationFields.delivery_trigger,
      metadata: metaBase,
    });
    if (!errLog.ok) {
      log.warn({ err: errLog.error }, "error fallback not persisted to chat log");
    }
    return [toTelegramHtml(fallback)];
  } finally {
    if (typingInterval) {
      clearInterval(typingInterval);
    }
  }
}
