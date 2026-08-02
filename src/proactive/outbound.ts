import { splitPlainForTelegram } from "../magnus/telegramChunk.js";
import { markdownishToTelegramHtml } from "../magnus/telegramFormat.js";
import { logger } from "../logger.js";
import { recordMagnusChatMessage } from "../tools/chatLog.js";
import type { ProactiveSendInput } from "./types.js";

/**
 * Send Magnus-initiated plain text to Telegram as HTML chunks and persist each chunk.
 */
export async function sendProactiveTelegram(input: ProactiveSendInput): Promise<void> {
  const { sendProactiveTelegramHtml } = await import("./outboundTelegraf.js");
  const plainChunks = splitPlainForTelegram(input.plainText);
  const htmlChunks = plainChunks.map((p) => markdownishToTelegramHtml(p));

  for (let i = 0; i < htmlChunks.length; i++) {
    const plain = plainChunks[i]!;
    const html = htmlChunks[i]!;
    await sendProactiveTelegramHtml(html, input.chatId);
    const log = await recordMagnusChatMessage({
      user_profile_id: input.userProfileId,
      telegram_user_id: input.telegramUserIdForLog,
      role: "assistant",
      content: plain,
      source: "telegram",
      intent: input.intent ?? input.kind,
      metadata: {
        proactive: true,
        proactive_kind: input.kind,
        proactive_trigger: input.trigger,
        format: "html",
        chunk_index: i,
        chunk_count: htmlChunks.length,
      },
    });
    if (!log.ok) {
      logger.warn(
        { err: log.error, kind: input.kind, userProfileId: input.userProfileId },
        "proactive message not persisted to chat log",
      );
    }
  }
}

/** Test hook: replace Telegraf send without loading the bot token. */
export let proactiveTelegramSendImpl: (
  html: string,
  chatId: string,
) => Promise<void> = async (html, chatId) => {
  const { getTelegramBot } = await import("./outboundTelegraf.js");
  await getTelegramBot().telegram.sendMessage(chatId, html, { parse_mode: "HTML" });
};

export function setProactiveTelegramSendImplForTests(
  impl: (html: string, chatId: string) => Promise<void>,
): void {
  proactiveTelegramSendImpl = impl;
}

export function resetProactiveTelegramSendImplForTests(): void {
  proactiveTelegramSendImpl = async (html, chatId) => {
    const { getTelegramBot } = await import("./outboundTelegraf.js");
    await getTelegramBot().telegram.sendMessage(chatId, html, { parse_mode: "HTML" });
  };
}
