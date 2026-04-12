import { Markup, Telegraf } from "telegraf";

import { logger, maskTelegramUserId } from "../logger.js";
import { loggableError } from "../util/loggableError.js";
import {
  recordMagnusChatMessage,
  resolveTelegramUserProfile,
} from "./chatLog.js";
import { redis } from "./clients.js";
import { checkMessageRateLimit } from "./rateLimit.js";
import {
  getTelegramBotCommandsForRegistration,
  inlineKeyboardCommands,
  isSlashCommandKey,
} from "../agents/routing/slashCommands.js";
import {
  clearPendingSlashCommand,
  mergePendingSlashIntoMessage,
  setPendingSlashCommand,
} from "./pendingSlashSelection.js";

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

function buildDepartmentInlineKeyboard() {
  const items = inlineKeyboardCommands();
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  for (let i = 0; i < items.length; i += 2) {
    const a = items[i];
    const b = items[i + 1];
    const row = [Markup.button.callback(a.label, `magnus_cmd:${a.command}`)];
    if (b) {
      row.push(Markup.button.callback(b.label, `magnus_cmd:${b.command}`));
    }
    rows.push(row);
  }
  return Markup.inlineKeyboard(rows);
}

async function runMorningBriefForCtx(
  telegramUserId: string,
  replyPlain: (r: string) => Promise<unknown>,
): Promise<void> {
  try {
    const { runMorningBriefForTelegramUser } = await import(
      "../jobs/morningBriefManual.js"
    );
    const out = await runMorningBriefForTelegramUser(telegramUserId, new Date());
    if (out.ok) {
      await replyPlain(out.ack);
    } else {
      await replyPlain(out.reply);
    }
  } catch (e) {
    logger.error(
      { err: loggableError(e), telegramUserId: maskTelegramUserId(telegramUserId) },
      "morning brief command failed",
    );
    await replyPlain("Something went wrong. Check server logs.");
  }
}

export function startBot(onMessage: TelegramTextHandler): Promise<void> {
  const b = getBot();

  b.on("callback_query", async (ctx) => {
    const updateId = ctx.update.update_id;
    if (!(await claimTelegramUpdate(updateId))) {
      await ctx.answerCbQuery();
      return;
    }

    const cq = ctx.callbackQuery;
    const data =
      cq && "data" in cq && typeof cq.data === "string" ? cq.data : undefined;
    if (!data?.startsWith("magnus_cmd:")) {
      await ctx.answerCbQuery();
      return;
    }

    const key = data.slice("magnus_cmd:".length);
    const telegramUserId = String(ctx.from?.id ?? "");
    if (!telegramUserId) {
      await ctx.answerCbQuery();
      return;
    }

    const rate = await checkMessageRateLimit(telegramUserId);
    if (!rate.ok) {
      await ctx.answerCbQuery(`Slow down — try in ~${rate.retryAfterSec}s`);
      return;
    }

    try {
      if (key === "morningbrief") {
        await ctx.answerCbQuery();
        await runMorningBriefForCtx(telegramUserId, (r) => ctx.reply(r));
        return;
      }

      if (!isSlashCommandKey(key)) {
        await ctx.answerCbQuery("Unknown command");
        return;
      }

      await setPendingSlashCommand(telegramUserId, key);
      await ctx.answerCbQuery("Now type your message");
      await ctx.reply(
        "Lane selected. Send your next message as plain text (no slash). It will be routed as that department. Sending any /command cancels this pick.",
      );
    } catch (e) {
      logger.error(
        { err: loggableError(e), telegramUserId: maskTelegramUserId(telegramUserId) },
        "callback_query handler failed",
      );
      await ctx.answerCbQuery("Error — try again");
    }
  });

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

    const rawText = await mergePendingSlashIntoMessage(telegramUserId, ctx.message.text);

    if (/^\/menu(?:@\S+)?\s*$/i.test(rawText.trim())) {
      await clearPendingSlashCommand(telegramUserId);
      await ctx.reply(
        "Pick a lane below — then type your message and send. Your text is combined with that department (no empty slash-only turn).",
        buildDepartmentInlineKeyboard(),
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
      await runMorningBriefForCtx(telegramUserId, (r) => reply(r));
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

  process.once("SIGINT", () => b.stop("SIGINT"));
  process.once("SIGTERM", () => b.stop("SIGTERM"));

  return new Promise((resolve, reject) => {
    void b
      .launch({}, async () => {
        try {
          await b.telegram.setMyCommands([
            ...getTelegramBotCommandsForRegistration(),
          ]);
        } catch (e) {
          logger.warn({ err: loggableError(e) }, "setMyCommands failed (non-fatal)");
        }
        resolve();
      })
      .catch(reject);
  });
}
