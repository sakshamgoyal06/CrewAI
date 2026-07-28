import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "../../logger.js";
import { anthropic, supabase as defaultSupabase } from "../../tools/clients.js";
import { loggableError } from "../../util/loggableError.js";
import type { MemoryConfig } from "./memoryConfig.js";

export const SEMANTIC_SUMMARY_PERIOD = "semantic_facts";

const EXTRACT_SYSTEM = `You extract durable user-specific facts from a single assistant chat turn.
Return JSON only: { "facts": string[] }
Each fact is one short sentence (preference, goal, constraint, correction, or standing rule).
Skip ephemeral small talk. Max 5 facts. Empty array if nothing worth remembering.`;

export async function loadSemanticFacts(
  userProfileId: string,
  limit: number,
  deps: { supabase?: SupabaseClient } = {},
): Promise<string[]> {
  const sb = deps.supabase ?? defaultSupabase;
  const { data, error } = await sb
    .from("memory_summaries")
    .select("summary_text, created_at")
    .eq("user_profile_id", userProfileId)
    .eq("period", SEMANTIC_SUMMARY_PERIOD)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, limit * 3));

  if (error) {
    logger.warn({ err: loggableError(error), userProfileId }, "memory: semantic facts load failed");
    return [];
  }

  const facts: string[] = [];
  for (const row of data ?? []) {
    const raw = typeof row.summary_text === "string" ? row.summary_text.trim() : "";
    if (!raw) {
      continue;
    }
    try {
      const parsed = JSON.parse(raw) as { facts?: unknown };
      if (Array.isArray(parsed.facts)) {
        for (const f of parsed.facts) {
          if (typeof f === "string" && f.trim()) {
            facts.push(f.trim());
          }
        }
      }
    } catch {
      facts.push(raw);
    }
    if (facts.length >= limit) {
      break;
    }
  }
  return facts.slice(0, limit);
}

function parseFactsFromModelText(text: string): string[] {
  const trimmed = text.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    try {
      const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as { facts?: unknown };
      if (Array.isArray(parsed.facts)) {
        return parsed.facts
          .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
          .map((f) => f.trim())
          .slice(0, 5);
      }
    } catch {
      /* fall through */
    }
  }
  return [];
}

export async function extractSemanticFacts(input: {
  userMessage: string;
  assistantReply: string;
  config: MemoryConfig;
}): Promise<string[]> {
  const msg = await anthropic.messages.create({
    model: input.config.semanticModel,
    max_tokens: 512,
    system: EXTRACT_SYSTEM,
    messages: [
      {
        role: "user",
        content: `User:\n${input.userMessage.trim()}\n\nAssistant:\n${input.assistantReply.trim()}`,
      },
    ],
  });

  for (const block of msg.content) {
    if (block.type === "text") {
      return parseFactsFromModelText(block.text);
    }
  }
  return [];
}

export async function persistSemanticFacts(
  userProfileId: string,
  facts: string[],
  deps: { supabase?: SupabaseClient } = {},
): Promise<void> {
  if (facts.length === 0) {
    return;
  }
  const sb = deps.supabase ?? defaultSupabase;
  const { error } = await sb.from("memory_summaries").insert({
    user_profile_id: userProfileId,
    summary_text: JSON.stringify({ facts }),
    period: SEMANTIC_SUMMARY_PERIOD,
    window_days: null,
  });
  if (error) {
    logger.warn({ err: loggableError(error), userProfileId }, "memory: semantic facts persist failed");
  }
}

/** Phase 3 post-turn — fire-and-forget safe. */
export async function updateSemanticMemoryAfterTurn(input: {
  userProfileId: string;
  userMessage: string;
  assistantReply: string;
  config: MemoryConfig;
  deps?: { supabase?: SupabaseClient };
}): Promise<void> {
  if (!input.config.semanticExtractEnabled || !input.config.semanticPersistEnabled) {
    return;
  }
  const facts = await extractSemanticFacts({
    userMessage: input.userMessage,
    assistantReply: input.assistantReply,
    config: input.config,
  });
  await persistSemanticFacts(input.userProfileId, facts, input.deps);
}
