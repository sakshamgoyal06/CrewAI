import { Telegraf } from "telegraf";

import { logger, maskTelegramUserId } from "../logger.js";
import { loggableError } from "../util/loggableError.js";
import {
  recordMagnusChatMessage,
  resolveTelegramUserProfile,
} from "./chatLog.js";
import { checkMessageRateLimit } from "./rateLimit.js";

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

export type TelegramTextHandler = (
  text: string,
  reply: (r: string) => void,
  telegramUserId: string,
  updateId?: number,
) => Promise<void>;

export function startBot(onMessage: TelegramTextHandler): Promise<void> {
  const b = getBot();

  b.on("text", async (ctx) => {
    const telegramUserId = String(ctx.from?.id ?? ctx.chat.id);
    const reply = (r: string): void => {
      void ctx.reply(r);
    };
    const rate = await checkMessageRateLimit(telegramUserId);
    if (!rate.ok) {
      reply(
        `You're sending messages too quickly. Try again in about ${rate.retryAfterSec} seconds.`,
      );
      return;
    }
    await onMessage(ctx.message.text, reply, telegramUserId, ctx.update.update_id);
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
