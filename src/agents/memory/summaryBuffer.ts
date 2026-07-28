import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "../../logger.js";
import { anthropic, supabase as defaultSupabase } from "../../tools/clients.js";
import { loggableError } from "../../util/loggableError.js";
import type { MemoryConfig } from "./memoryConfig.js";
import type { MemoryChatTurn } from "./types.js";

export const CONVERSATION_SUMMARY_PERIOD = "conversation_rolling";

function truncateContent(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) {
    return t;
  }
  return `${t.slice(0, max)}…`;
}

/** Split fetched turns into verbatim window vs older turns for summarization. */
export function splitChatTurnsForBuffer(
  chronologicalTurns: MemoryChatTurn[],
  verbatimLimit: number,
): { verbatim: MemoryChatTurn[]; older: MemoryChatTurn[] } {
  if (chronologicalTurns.length <= verbatimLimit) {
    return { verbatim: chronologicalTurns, older: [] };
  }
  const splitAt = chronologicalTurns.length - verbatimLimit;
  return {
    older: chronologicalTurns.slice(0, splitAt),
    verbatim: chronologicalTurns.slice(splitAt),
  };
}

/** Drop the in-flight user message already represented in `rawMessage`. */
export function excludeDuplicateCurrentUserTurn(
  turns: MemoryChatTurn[],
  rawMessage: string,
): MemoryChatTurn[] {
  const trimmed = rawMessage.trim();
  if (!trimmed || turns.length === 0) {
    return turns;
  }
  const last = turns[turns.length - 1];
  if (last?.role === "user" && last.content.trim() === trimmed) {
    return turns.slice(0, -1);
  }
  return turns;
}

export async function loadRollingConversationSummary(
  userProfileId: string,
  deps: { supabase?: SupabaseClient } = {},
): Promise<string | undefined> {
  const sb = deps.supabase ?? defaultSupabase;
  const { data, error } = await sb
    .from("memory_summaries")
    .select("summary_text, created_at")
    .eq("user_profile_id", userProfileId)
    .eq("period", CONVERSATION_SUMMARY_PERIOD)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.warn(
      { err: loggableError(error), userProfileId },
      "memory: conversation summary load failed",
    );
    return undefined;
  }
  const text = typeof data?.summary_text === "string" ? data.summary_text.trim() : "";
  return text || undefined;
}

const SUMMARY_SYSTEM = `You compress older chat turns into a dense rolling summary for a personal assistant.
Preserve: decisions, constraints, names, dates, numbers, corrections the user made, agenda items, and task outcomes.
Drop: greetings, filler, repeated tool dumps, and speculation.
Output plain text bullet points only — no preamble.`;

export async function generateConversationSummary(
  olderTurns: MemoryChatTurn[],
  existingSummary: string | undefined,
  config: MemoryConfig,
): Promise<string> {
  if (olderTurns.length === 0) {
    return existingSummary?.trim() ?? "";
  }

  const lines = olderTurns.map((t) => {
    const role = t.role === "assistant" ? "Magnus" : "User";
    return `${role}: ${t.content}`;
  });

  const userPrompt = [
    existingSummary?.trim()
      ? `Existing summary (update and merge — do not lose facts):\n${existingSummary.trim()}`
      : "No existing summary.",
    "",
    "Older turns to fold in:",
    lines.join("\n"),
  ].join("\n");

  const msg = await anthropic.messages.create({
    model: config.summaryModel,
    max_tokens: 1024,
    system: SUMMARY_SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
  });

  for (const block of msg.content) {
    if (block.type === "text") {
      return truncateContent(block.text.trim(), config.summaryMaxChars);
    }
  }
  return existingSummary?.trim() ?? "";
}

export async function persistRollingConversationSummary(
  userProfileId: string,
  summaryText: string,
  deps: { supabase?: SupabaseClient } = {},
): Promise<void> {
  const text = summaryText.trim();
  if (!text) {
    return;
  }
  const sb = deps.supabase ?? defaultSupabase;
  const { error } = await sb.from("memory_summaries").insert({
    user_profile_id: userProfileId,
    summary_text: text,
    period: CONVERSATION_SUMMARY_PERIOD,
    window_days: null,
  });
  if (error) {
    logger.warn(
      { err: loggableError(error), userProfileId },
      "memory: conversation summary persist failed",
    );
  }
}

/**
 * Phase 2 post-turn: extend rolling summary with turns that aged out of the verbatim window.
 */
export async function updateRollingSummaryAfterTurn(input: {
  userProfileId: string;
  chronologicalTurns: MemoryChatTurn[];
  config: MemoryConfig;
  deps?: { supabase?: SupabaseClient };
}): Promise<void> {
  if (!input.config.summaryBufferEnabled || !input.config.summaryPersistEnabled) {
    return;
  }

  const { older } = splitChatTurnsForBuffer(
    input.chronologicalTurns,
    input.config.verbatimTurnLimit,
  );
  if (older.length === 0) {
    return;
  }

  const existing = await loadRollingConversationSummary(input.userProfileId, input.deps);
  const updated = await generateConversationSummary(older, existing, input.config);
  if (updated) {
    await persistRollingConversationSummary(input.userProfileId, updated, input.deps);
  }
}
