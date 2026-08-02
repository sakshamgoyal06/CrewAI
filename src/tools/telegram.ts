import { Telegraf } from "telegraf";

import {
  handlerTimeoutMs,
  redactWebhookUrl,
  resolveTelegramRuntime,
  type TelegramRuntimeMode,
} from "../config/telegramRuntime.js";
import { logger, maskTelegramUserId } from "../logger.js";
import { loggableError } from "../util/loggableError.js";
import {
  recordMagnusChatMessage,
  resolveTelegramUserProfile,
} from "./chatLog.js";
import { redis } from "./clients.js";
import { checkMessageRateLimit } from "./rateLimit.js";
import {
  buildHelpMessage,
  buildStartMessage,
  isHelpCommand,
  isStartCommand,
} from "../magnus/telegramIntro.js";
import { BOT_COMMANDS } from "../config/telegramCommands.js";
import {
  isMorningBriefTrigger,
  runMorningBriefForTelegramUser,
} from "../proactive/morningBriefManual.js";

const TELEGRAM_UPDATE_DEDUP_TTL_SEC = 86_400;

/** Returns false when this `update_id` was already processed (webhook retry). */
async function claimTelegramUpdate(updateId: number): Promise<boolean> {
  const key = `magnus:telegram_update:${updateId}`;
  try {
    const res = await redis.set(key, "1", {
      nx: true,
      ex: TELEGRAM_UPDATE_DEDUP_TTL_SEC,
    });
    return res !== null;
  } catch (e) {
    logger.error(
      { err: loggableError(e), updateId },
      "telegram update dedup redis error; allowing message",
    );
    return true;
  }
}

function getToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN");
  }
  return token;
}

let bot: Telegraf | null = null;

function getBot(): Telegraf {
  if (!bot) {
    bot = new Telegraf(getToken(), { handlerTimeout: handlerTimeoutMs() });
  }
  return bot;
}

async function logOutgoingAssistant(
  text: string,
  format: "plain" | "markdown_v2_source",
  telegramUserIdForLog: string,
): Promise<void> {
  try {
    const user = await resolveTelegramUserProfile(telegramUserIdForLog);
    await recordMagnusChatMessage({
      user_profile_id: user.profileId,
      telegram_user_id: user.telegramUserId,
      role: "assistant",
      content: text,
      source: "telegram",
      intent: null,
      metadata: {
        outbound: true,
        format,
        telegram_user_id: user.telegramUserId,
        user_tier: user.userTier,
        access_flags: user.accessFlags,
      },
    });
  } catch (e) {
    logger.error(
      { err: loggableError(e), telegramUserId: maskTelegramUserId(telegramUserIdForLog) },
      "log outgoing message failed",
    );
  }
}

function resolveSendTargets(opts?: {
  chatId?: string;
  telegramUserIdForLog?: string;
}): { chatId: string; logAsTelegramUserId: string } {
  const chatId =
    opts?.chatId?.trim() || process.env.TELEGRAM_CHAT_ID?.trim() || "";
  if (!chatId) {
    throw new Error("Missing TELEGRAM_CHAT_ID or opts.chatId");
  }
  const logAsTelegramUserId =
    opts?.telegramUserIdForLog?.trim() || chatId;
  return { chatId, logAsTelegramUserId };
}

export async function sendMessage(
  text: string,
  opts?: { chatId?: string; telegramUserIdForLog?: string },
): Promise<void> {
  const { chatId, logAsTelegramUserId } = resolveSendTargets(opts);
  await getBot().telegram.sendMessage(chatId, text);
  await logOutgoingAssistant(text, "plain", logAsTelegramUserId);
}

function escapeMarkdownV2(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

export async function sendMarkdown(
  text: string,
  opts?: { chatId?: string; telegramUserIdForLog?: string },
): Promise<void> {
  const { chatId, logAsTelegramUserId } = resolveSendTargets(opts);
  const payload = escapeMarkdownV2(text);
  await getBot().telegram.sendMessage(chatId, payload, {
    parse_mode: "MarkdownV2",
  });
  await logOutgoingAssistant(text, "markdown_v2_source", logAsTelegramUserId);
}

/** Use HTML for assistant Markdown-ish content (see `markdownishToTelegramHtml`). */
export type ReplyOptions = {
  parse_mode?: "HTML";
};

export type TelegramTextHandler = (
  text: string,
  reply: (r: string, opts?: ReplyOptions) => Promise<void>,
  telegramUserId: string,
  updateId?: number,
  sendTyping?: () => void | Promise<void>,
) => Promise<void>;

export type TelegramWebhookMount = {
  /** Full URL registered with Telegram (the watchdog compares against it). */
  url: string;
  path: string;
  secretToken: string;
  handleUpdate: (update: unknown) => Promise<void>;
};

export type TelegramRuntime = {
  mode: TelegramRuntimeMode;
  /** Present in webhook mode: mount this on the health server before calling `start()`. */
  webhook?: TelegramWebhookMount;
  /** Begin receiving updates: launch polling, or register the webhook with Telegram. */
  start: () => Promise<void>;
  stop: (reason: string) => void;
  /** Watchdog probe. */
  getMe: () => Promise<unknown>;
  getWebhookUrl: () => Promise<string>;
  registerWebhook: () => Promise<void>;
};

/**
 * Registers handlers and returns a runtime that has not started receiving updates yet, so the
 * caller can mount the webhook route before Telegram is told where to deliver.
 */
export function createTelegramRuntime(onMessage: TelegramTextHandler): TelegramRuntime {
  const b = getBot();
  const config = resolveTelegramRuntime();

  b.on("text", async (ctx) => {
    const updateId = ctx.update.update_id;
    if (!(await claimTelegramUpdate(updateId))) {
      logger.debug({ updateId }, "duplicate telegram update ignored");
      return;
    }

    const telegramUserId = String(ctx.from?.id ?? ctx.chat.id);
    const chatId = ctx.chat?.id;
    const reply = async (r: string, opts?: ReplyOptions): Promise<void> => {
      if (opts?.parse_mode === "HTML") {
        await ctx.reply(r, { parse_mode: "HTML" });
      } else {
        await ctx.reply(r);
      }
    };

    const sendTyping =
      chatId !== undefined
        ? () => {
            void ctx.telegram.sendChatAction(chatId, "typing");
          }
        : undefined;

    const rawText = ctx.message.text;

    if (isStartCommand(rawText) || isHelpCommand(rawText)) {
      await ctx.reply(
        isStartCommand(rawText) ? buildStartMessage() : buildHelpMessage(),
        { parse_mode: "HTML" },
      );
      return;
    }

    if (isMorningBriefTrigger(rawText)) {
      const rate = await checkMessageRateLimit(telegramUserId);
      if (!rate.ok) {
        await reply(
          `You're sending messages too quickly. Try again in about ${rate.retryAfterSec} seconds.`,
        );
        return;
      }
      const brief = await runMorningBriefForTelegramUser(telegramUserId);
      if (!brief.ok) {
        await reply(brief.error);
        return;
      }
      if (brief.skipped || !brief.text.trim()) {
        await reply("Morning Brief is not available right now.");
        return;
      }
      return;
    }

    const rate = await checkMessageRateLimit(telegramUserId);
    if (!rate.ok) {
      await reply(
        `You're sending messages too quickly. Try again in about ${rate.retryAfterSec} seconds.`,
      );
      return;
    }
    await onMessage(rawText, reply, telegramUserId, updateId, sendTyping);
  });

  b.catch((err, ctx) => {
    logger.error(
      { err: loggableError(err), updateType: ctx.updateType },
      "unhandled telegraf error",
    );
  });

  async function registerCommands(): Promise<void> {
    try {
      await b.telegram.setMyCommands([...BOT_COMMANDS]);
    } catch (e) {
      logger.warn({ err: loggableError(e) }, "setMyCommands failed (non-fatal)");
    }
  }

  async function registerWebhook(): Promise<void> {
    const hook = config.webhook;
    if (!hook) {
      return;
    }
    await b.telegram.setWebhook(hook.url, {
      secret_token: hook.secretToken,
      allowed_updates: ["message"],
    });
  }

  async function startPolling(): Promise<void> {
    // A webhook left over from a previous webhook-mode deploy would swallow every update.
    try {
      await b.telegram.deleteWebhook();
    } catch (e) {
      logger.warn({ err: loggableError(e) }, "deleteWebhook before polling failed");
    }
    await new Promise<void>((resolve, reject) => {
      void b
        .launch({}, async () => {
          await registerCommands();
          resolve();
        })
        .catch(reject);
    });
  }

  async function startWebhook(): Promise<void> {
    await registerWebhook();
    await registerCommands();
  }

  return {
    mode: config.mode,
    webhook: config.webhook
      ? {
          url: config.webhook.url,
          path: config.webhook.path,
          secretToken: config.webhook.secretToken,
          handleUpdate: async (update) => {
            await b.handleUpdate(update as Parameters<typeof b.handleUpdate>[0]);
          },
        }
      : undefined,
    start: async () => {
      logger.info(
        {
          mode: config.mode,
          reason: config.reason,
          webhookUrl: config.webhook ? redactWebhookUrl(config.webhook.url) : null,
        },
        "starting telegram runtime",
      );
      if (config.mode === "webhook") {
        await startWebhook();
      } else {
        await startPolling();
      }
    },
    stop: (reason: string) => b.stop(reason),
    getMe: () => b.telegram.getMe(),
    getWebhookUrl: async () => {
      const info = await b.telegram.getWebhookInfo();
      return info.url ?? "";
    },
    registerWebhook,
  };
}

/** Long-polling shortcut kept for scripts and tests that do not need the webhook path. */
export async function startBot(onMessage: TelegramTextHandler): Promise<void> {
  await createTelegramRuntime(onMessage).start();
}
