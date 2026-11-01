/**
 * Step 4 — pgvector storage + search for recall_context.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "../../logger.js";
import { supabase as defaultSupabase } from "../../tools/clients.js";
import { loggableError } from "../../util/loggableError.js";
import { embedText, cosineSimilarity } from "./embedText.js";
import { memoryEmbeddingConfig } from "./memoryEmbeddingConfig.js";

export type MemoryEmbeddingSourceType = "journal" | "topic" | "chat_turn";

export type MemoryEmbeddingRow = {
  id: string;
  source_type: string;
  source_id: string;
  chunk_text: string;
  similarity: number;
  created_at: string;
};

export function formatEmbeddingForPg(vector: number[]): string {
  return `[${vector.map((v) => Number(v.toFixed(8)).toString()).join(",")}]`;
}

export function isDecisionTurn(userMessage: string, assistantReply: string): boolean {
  const combined = `${userMessage}\n${assistantReply}`.toLowerCase();
  return /\b(decided|decision|let'?s go with|going with|we'?ll|plan is|agreed to|settled on)\b/.test(
    combined,
  );
}

export async function indexMemoryChunk(input: {
  userProfileId: string;
  sourceType: MemoryEmbeddingSourceType;
  sourceId: string;
  chunkText: string;
  metadata?: Record<string, unknown>;
  deps?: { supabase?: SupabaseClient };
}): Promise<void> {
  const config = memoryEmbeddingConfig();
  if (!config.enabled) {
    return;
  }
  const text = input.chunkText.trim();
  if (!text) {
    return;
  }

  const sb = input.deps?.supabase ?? defaultSupabase;
  try {
    const embedding = await embedText(text);
    const { error } = await sb.from("memory_embeddings").upsert(
      {
        user_profile_id: input.userProfileId,
        source_type: input.sourceType,
        source_id: input.sourceId.slice(0, 200),
        chunk_text: text.slice(0, 8000),
        embedding: formatEmbeddingForPg(embedding),
        metadata: input.metadata ?? {},
        created_at: new Date().toISOString(),
      },
      { onConflict: "user_profile_id,source_type,source_id" },
    );
    if (error) {
      logger.warn(
        { err: loggableError(error), userProfileId: input.userProfileId, sourceType: input.sourceType },
        "memory: embedding index failed",
      );
    }
  } catch (e) {
    logger.warn({ err: loggableError(e) }, "memory: indexMemoryChunk failed");
  }
}

export async function searchMemoryEmbeddings(input: {
  userProfileId: string;
  query: string;
  limit?: number;
  since?: string;
  deps?: { supabase?: SupabaseClient };
}): Promise<MemoryEmbeddingRow[]> {
  const config = memoryEmbeddingConfig();
  if (!config.enabled) {
    return [];
  }

  const sb = input.deps?.supabase ?? defaultSupabase;
  const limit = Math.min(Math.max(input.limit ?? config.defaultRecallLimit, 1), 20);
  const queryEmbedding = await embedText(input.query.trim());

  try {
    const { data, error } = await sb.rpc("match_memory_embeddings", {
      p_user_profile_id: input.userProfileId,
      query_embedding: formatEmbeddingForPg(queryEmbedding),
      match_count: limit,
      since_ts: input.since?.trim() || null,
    });

    if (!error && Array.isArray(data)) {
      return data.map((row: Record<string, unknown>) => ({
        id: String(row.id),
        source_type: String(row.source_type),
        source_id: String(row.source_id),
        chunk_text: String(row.chunk_text),
        similarity: Number(row.similarity ?? 0),
        created_at: String(row.created_at),
      }));
    }

    if (error) {
      logger.warn({ err: loggableError(error) }, "memory: RPC match failed — in-memory fallback");
    }
  } catch (e) {
    logger.warn({ err: loggableError(e) }, "memory: searchMemoryEmbeddings RPC error");
  }

  return searchMemoryEmbeddingsFallback({
    userProfileId: input.userProfileId,
    queryEmbedding,
    limit,
    since: input.since,
    deps: input.deps,
  });
}

async function searchMemoryEmbeddingsFallback(input: {
  userProfileId: string;
  queryEmbedding: number[];
  limit: number;
  since?: string;
  deps?: { supabase?: SupabaseClient };
}): Promise<MemoryEmbeddingRow[]> {
  const sb = input.deps?.supabase ?? defaultSupabase;
  let q = sb
    .from("memory_embeddings")
    .select("id, source_type, source_id, chunk_text, embedding, created_at")
    .eq("user_profile_id", input.userProfileId)
    .limit(200);

  if (input.since?.trim()) {
    q = q.gte("created_at", input.since.trim());
  }

  const { data, error } = await q;
  if (error || !data?.length) {
    return [];
  }

  const scored = data
    .map((row) => {
      const raw = row.embedding;
      let vector: number[] = [];
      if (typeof raw === "string") {
        vector = raw
          .replace(/^\[|\]$/g, "")
          .split(",")
          .map((v) => Number.parseFloat(v.trim()))
          .filter((n) => Number.isFinite(n));
      } else if (Array.isArray(raw)) {
        vector = raw as number[];
      }
      return {
        id: String(row.id),
        source_type: String(row.source_type),
        source_id: String(row.source_id),
        chunk_text: String(row.chunk_text),
        created_at: String(row.created_at),
        similarity: cosineSimilarity(input.queryEmbedding, vector),
      };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, input.limit);

  return scored;
}

export async function indexJournalEmbedding(input: {
  userProfileId: string;
  dailyLogId: string;
  body: string;
  deps?: { supabase?: SupabaseClient };
}): Promise<void> {
  const config = memoryEmbeddingConfig();
  if (!config.indexJournal) {
    return;
  }
  await indexMemoryChunk({
    userProfileId: input.userProfileId,
    sourceType: "journal",
    sourceId: input.dailyLogId,
    chunkText: input.body,
    metadata: { kind: "journal" },
    deps: input.deps,
  });
}

export async function indexTopicEmbedding(input: {
  userProfileId: string;
  topicKey: string;
  body: string;
  deps?: { supabase?: SupabaseClient };
}): Promise<void> {
  const config = memoryEmbeddingConfig();
  if (!config.indexTopics) {
    return;
  }
  await indexMemoryChunk({
    userProfileId: input.userProfileId,
    sourceType: "topic",
    sourceId: input.topicKey,
    chunkText: input.body,
    metadata: { kind: "topic" },
    deps: input.deps,
  });
}

export async function indexChatTurnEmbedding(input: {
  userProfileId: string;
  userMessage: string;
  assistantReply: string;
  turnId?: string;
  deps?: { supabase?: SupabaseClient };
}): Promise<void> {
  const config = memoryEmbeddingConfig();
  if (!config.indexChatTurns) {
    return;
  }
  if (!isDecisionTurn(input.userMessage, input.assistantReply)) {
    return;
  }
  const chunk = `User: ${input.userMessage.trim()}\nAssistant: ${input.assistantReply.trim()}`.slice(
    0,
    4000,
  );
  const sourceId =
    input.turnId?.trim() ||
    `turn_${Date.now()}_${input.userMessage.slice(0, 24).replace(/\W+/g, "_")}`;
  await indexMemoryChunk({
    userProfileId: input.userProfileId,
    sourceType: "chat_turn",
    sourceId,
    chunkText: chunk,
    metadata: { kind: "decision_turn" },
    deps: input.deps,
  });
}
