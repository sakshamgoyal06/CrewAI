import { Telegraf } from "telegraf";

import { logger, maskTelegramUserId } from "../logger.js";
import { loggableError } from "../util/loggableError.js";
import {
  recordMagnusChatMessage,
  resolveTelegramUserProfile,
} from "./chatLog.js";
import { redis } from "./clients.js";
import { checkMessageRateLimit } from "./rateLimit.js";

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
    bot = new Telegraf(getToken());
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

function isMorningBriefTrigger(text: string): boolean {
  const t = text.trim();
  if (/^\/morningbrief(@\S+)?\b/i.test(t)) {
    return true;
  }
  return /^morning\s+brief\.?$/i.test(t);
}

export function startBot(onMessage: TelegramTextHandler): Promise<void> {
  const b = getBot();

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
    if (isMorningBriefTrigger(rawText)) {
      const rate = await checkMessageRateLimit(telegramUserId);
      if (!rate.ok) {
        await reply(
          `You're sending messages too quickly. Try again in about ${rate.retryAfterSec} seconds.`,
        );
        return;
      }
      try {
        const { runMorningBriefForTelegramUser } = await import(
          "../jobs/morningBriefManual.js"
        );
        const out = await runMorningBriefForTelegramUser(telegramUserId, new Date());
        if (out.ok) {
          await reply(out.ack);
        } else {
          await reply(out.reply);
        }
      } catch (e) {
        logger.error(
          { err: loggableError(e), telegramUserId: maskTelegramUserId(telegramUserId) },
          "morning brief command failed",
        );
        await reply("Something went wrong. Check server logs.");
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
    await onMessage(ctx.message.text, reply, telegramUserId, updateId, sendTyping);
  });

  process.once("SIGINT", () => b.stop("SIGINT"));
  process.once("SIGTERM", () => b.stop("SIGTERM"));

  return new Promise((resolve, reject) => {
    void b
      .launch({}, () => {
        resolve();
      })
      .catch(reject);
  });
}
