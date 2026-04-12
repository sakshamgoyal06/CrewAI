/**
 * MAGNUS — orchestrator agent: wires agents, tools, memory, and scheduler.
 */
import { scheduleMorningBriefCron } from "./jobs/morningBriefCron.js";
import { runOrchestratorReply } from "./agents/magnusOrchestrator.js";
import { isDelegationNoticeEnabled } from "./config/projectSettings.js";
import { formatDelegationNotice } from "./magnus/delegationNotice.js";
import {
  getDisambiguationReply,
  resolveDisambiguationFollowUp,
} from "./magnus/intentDisambiguation.js";
import { splitPlainForTelegram } from "./magnus/telegramChunk.js";
import { markdownishToTelegramHtml } from "./magnus/telegramFormat.js";
import { logger, maskTelegramUserId } from "./logger.js";
import { loggableError } from "./util/loggableError.js";
import {
  recordMagnusChatMessage,
  resolveTelegramUserProfile,
} from "./tools/chatLog.js";

const NOT_ALLOWLISTED_REPLY =
  "You're not allowlisted to use Magnus yet. Ask an admin to enable your account.";

const TIER_NO_CHAT_REPLY =
  "Your access tier doesn't include chat right now. We'll expand this soon.";

function chatAllowed(accessFlags: Record<string, unknown>): boolean {
  if (accessFlags.chat === false) {
    return false;
  }
  return true;
}

function toTelegramHtml(text: string): string {
  return markdownishToTelegramHtml(text);
}

/** Split long plain assistant text, then convert each chunk to Telegram HTML. */
function plainChunksToTelegramHtml(plain: string): string[] {
  return splitPlainForTelegram(plain).map((p) => markdownishToTelegramHtml(p));
}

export type MagnusRuntime = {
  start(): void;
};

export function createMagnus(): MagnusRuntime {
  return {
    start() {
      scheduleMorningBriefCron();
    },
  };
}

export type HandleMessageOptions = {
  updateId?: number;
  /**
   * When set, delegation progress is sent here as soon as Magnus hands off to a specialist
   * (before memory load and before the specialist reply). Usually `reply` from Telegraf.
   */
  sendProgress?: (text: string) => void | Promise<void>;
  /** Telegram “typing…” indicator; refreshed while the orchestrator runs. */
  sendTyping?: () => void | Promise<void>;
};

/**
 * Outbound Telegram payloads in send order (HTML via `markdownishToTelegramHtml`).
 * Long replies are split into multiple chunks under Telegram’s size limit.
 */
export type HandleMessageResult = string[];

export async function handleMessage(
  userMessage: string,
  telegramUserId: string,
  options?: HandleMessageOptions,
): Promise<HandleMessageResult> {
  const { updateId, sendProgress, sendTyping } = options ?? {};

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
    const followUp = await resolveDisambiguationFollowUp(user.profileId, userMessage);
    const orchestratorMessage = followUp?.originalUserMessage ?? userMessage;
    const disambiguationChoice = followUp?.choice;

    if (!followUp) {
      const clarify = getDisambiguationReply(userMessage);
      if (clarify) {
        const clarifyLog = await recordMagnusChatMessage({
          user_profile_id: user.profileId,
          telegram_user_id: user.telegramUserId,
          role: "assistant",
          content: clarify,
          source: "telegram",
          intent: "GENERAL",
          metadata: {
            ...metaBase,
            disambiguation: true,
            original_user_message: userMessage,
          },
        });
        if (!clarifyLog.ok) {
          log.warn(
            { err: clarifyLog.error },
            "disambiguation reply not persisted to chat log",
          );
        }
        return [toTelegramHtml(clarify)];
      }
    }

    let progressNoticeSent = false;

    let typingInterval: ReturnType<typeof setInterval> | undefined;
    if (sendTyping) {
      void Promise.resolve(sendTyping()).catch(() => {});
      typingInterval = setInterval(() => {
        void Promise.resolve(sendTyping()).catch(() => {});
      }, 4500);
    }

    let orchestrated: Awaited<ReturnType<typeof runOrchestratorReply>>;
    try {
      orchestrated = await runOrchestratorReply({
        userMessage: orchestratorMessage,
        userProfileId: user.profileId,
        telegramUserId: user.telegramUserId,
        timezone: user.timezone,
        northStarGoal: user.northStarGoal,
        disambiguationChoice,
        onBeforeDelegation:
          isDelegationNoticeEnabled() && sendProgress
            ? async ({ intent, delegatedAgent }) => {
                const notice = formatDelegationNotice(delegatedAgent, intent);
                const noticeLog = await recordMagnusChatMessage({
                  user_profile_id: user.profileId,
                  telegram_user_id: user.telegramUserId,
                  role: "assistant",
                  content: notice,
                  source: "telegram",
                  intent,
                  metadata: {
                    ...metaBase,
                    delegation_notice: true,
                    delegated_agent: delegatedAgent,
                  },
                });
                if (!noticeLog.ok) {
                  log.warn(
                    { err: noticeLog.error },
                    "delegation notice not persisted to chat log",
                  );
                }
                await sendProgress(toTelegramHtml(notice));
                progressNoticeSent = true;
              }
            : isDelegationNoticeEnabled()
              ? async ({ intent, delegatedAgent }) => {
                  const notice = formatDelegationNotice(delegatedAgent, intent);
                  await recordMagnusChatMessage({
                    user_profile_id: user.profileId,
                    telegram_user_id: user.telegramUserId,
                    role: "assistant",
                    content: notice,
                    source: "telegram",
                    intent,
                    metadata: {
                      ...metaBase,
                      delegation_notice: true,
                      delegated_agent: delegatedAgent,
                    },
                  });
                }
              : undefined,
      });
    } finally {
      if (typingInterval) {
        clearInterval(typingInterval);
      }
    }

    const { replyText, intent } = orchestrated;
    const intentForLog =
      orchestrated.agentMetadata?.meal_log === true ? "meal_log" : intent;

    const assistantMetadata = {
      ...metaBase,
      ...(followUp ? { disambiguation_followup: true } : {}),
      ...(orchestrated.delegatedAgent !== undefined
        ? {
            delegated_agent: orchestrated.delegatedAgent,
            ...(orchestrated.agentMetadata !== undefined
              ? { agent_metadata: orchestrated.agentMetadata }
              : {}),
          }
        : {}),
    };

    const asstLog = await recordMagnusChatMessage({
      user_profile_id: user.profileId,
      telegram_user_id: user.telegramUserId,
      role: "assistant",
      content: replyText,
      source: "telegram",
      intent: intentForLog,
      metadata: assistantMetadata,
    });
    if (!asstLog.ok) {
      log.warn({ err: asstLog.error }, "assistant reply not persisted to chat log");
    }

    const replyHtmlChunks = plainChunksToTelegramHtml(replyText);

    if (
      isDelegationNoticeEnabled() &&
      orchestrated.delegatedAgent &&
      !progressNoticeSent
    ) {
      return [
        toTelegramHtml(formatDelegationNotice(orchestrated.delegatedAgent, intent)),
        ...replyHtmlChunks,
      ];
    }
    return replyHtmlChunks;
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
    return [toTelegramHtml(fallback)];
  }
}
