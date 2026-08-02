/**
 * Morning Brief job — LifeOS ritual (read, not task dump).
 */
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { sendProactiveTelegram } from "../proactive/outbound.js";
import type { ProactiveTrigger } from "../proactive/types.js";
import { buildMorningBriefSystem } from "./morningBriefPrompt.js";
import {
  buildMorningBriefUserMessage,
  fetchMorningBriefContext,
} from "./morningBriefContext.js";
import { morningBriefFeatureEnabled } from "./morningBriefEnv.js";
import { logger } from "../logger.js";

const MODEL = "claude-sonnet-4-6";

function textFromMessage(msg: Message): string {
  for (const block of msg.content) {
    if (block.type === "text") {
      return block.text;
    }
  }
  return "";
}

export type MorningBriefReason = "scheduled" | "manual" | "http";

export type RunMorningBriefInput = {
  userProfileId: string;
  telegramUserId: string;
  /** Telegram chat id for outbound send (defaults to telegramUserId). */
  chatId?: string;
  now: Date;
  reason: MorningBriefReason;
  /** When true, send the brief to Telegram (scheduled/manual/http). Default false. */
  deliverTelegram?: boolean;
};

export type MorningBriefDeps = {
  supabase: SupabaseClient;
  invokeClaude: (system: string, user: string) => Promise<string>;
  /** Override outbound send (tests). When omitted, uses proactive Telegram delivery. */
  sendTelegram?: (
    text: string,
    opts: { chatId: string; telegramUserIdForLog: string },
  ) => Promise<void>;
  createNotionPage?: (input: {
    userProfileId: string;
    title: string;
    body: string;
  }) => Promise<string | null>;
  /** When false, skip work. */
  featureEnabled?: () => boolean;
};

export type MorningBriefResult = {
  text: string;
  notionPageId: string | null;
  skipped: boolean;
};

function defaultFeatureEnabled(): boolean {
  return morningBriefFeatureEnabled();
}

async function defaultInvokeClaude(system: string, user: string): Promise<string> {
  const { anthropic } = await import("../tools/clients.js");
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system,
    messages: [{ role: "user", content: user }],
  });
  return textFromMessage(msg).trim() || "…";
}

/**
 * Splits long text for Telegram's message limit (~4096); keeps chunks safe for plain send.
 */
export function splitTelegramMessage(text: string, maxLen = 4000): string[] {
  if (text.length <= maxLen) {
    return [text];
  }
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > maxLen) {
    const slice = rest.slice(0, maxLen);
    const lastBreak = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf("\n"));
    const cut = lastBreak > Math.floor(maxLen * 0.5) ? lastBreak : maxLen;
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest.length) {
    chunks.push(rest);
  }
  return chunks.length ? chunks : [""];
}

export async function runMorningBrief(
  input: RunMorningBriefInput,
  deps?: Partial<MorningBriefDeps>,
): Promise<MorningBriefResult> {
  const supabase = deps?.supabase ?? (await import("../tools/clients.js")).supabase;
  const invokeClaude = deps?.invokeClaude ?? defaultInvokeClaude;
  const customSend = deps?.sendTelegram;
  const createNotionPage =
    deps?.createNotionPage ??
    (await import("../tools/notionMorningBrief.js")).createMorningBriefNotionPage;
  const featureEnabled = deps?.featureEnabled ?? defaultFeatureEnabled;

  if (!featureEnabled()) {
    logger.info({ reason: input.reason }, "morning brief skipped (feature flag)");
    return { text: "", notionPageId: null, skipped: true };
  }

  const bundle = await fetchMorningBriefContext(supabase, input.userProfileId, input.now, {});
  const userMsg = buildMorningBriefUserMessage(bundle);

  let briefText: string;
  try {
    briefText = await invokeClaude(buildMorningBriefSystem({ displayName: bundle.displayName }), userMsg);
  } catch (err) {
    logger.error({ err: String(err) }, "morning brief Claude call failed");
    return {
      text: "Morning brief could not be generated right now. Try again later.",
      notionPageId: null,
      skipped: false,
    };
  }

  const titleDate = input.now.toISOString().slice(0, 10);
  const notionTitle = `Morning Brief — ${titleDate}`;

  let notionPageId: string | null = null;
  try {
    notionPageId = await createNotionPage({
      userProfileId: input.userProfileId,
      title: notionTitle,
      body: briefText,
    });
  } catch (err) {
    logger.warn({ err: String(err) }, "morning brief Notion write failed (non-fatal)");
  }

  const deliverTelegram = input.deliverTelegram ?? false;
  if (deliverTelegram) {
    const chatId = input.chatId?.trim() || input.telegramUserId;
    const trigger: ProactiveTrigger =
      input.reason === "scheduled" ? "scheduled" : "manual";

    if (customSend) {
      const parts = splitTelegramMessage(briefText);
      for (const part of parts) {
        await customSend(part, {
          chatId,
          telegramUserIdForLog: input.telegramUserId,
        });
      }
    } else {
      await sendProactiveTelegram({
        chatId,
        telegramUserIdForLog: input.telegramUserId,
        userProfileId: input.userProfileId,
        plainText: briefText,
        kind: "morning_brief",
        trigger,
        intent: "morning_brief",
      });
    }
  }

  return { text: briefText, notionPageId, skipped: false };
}
