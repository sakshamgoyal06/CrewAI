import { Telegraf } from "telegraf";

import { handlerTimeoutMs } from "../config/telegramRuntime.js";
import { proactiveTelegramSendImpl } from "./outbound.js";

let bot: Telegraf | null = null;

function getToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN");
  }
  return token;
}

export function getTelegramBot(): Telegraf {
  if (!bot) {
    bot = new Telegraf(getToken(), { handlerTimeout: handlerTimeoutMs() });
  }
  return bot;
}

export async function sendProactiveTelegramHtml(html: string, chatId: string): Promise<void> {
  await proactiveTelegramSendImpl(html, chatId);
}
