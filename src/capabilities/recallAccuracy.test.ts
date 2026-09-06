/**
 * Step 4 — recall@5 accuracy gate on seeded fixture embeddings.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { fixtureEmbedText } from "../agents/memory/embedText.js";
import {
  resetMemoryEmbeddingConfigForTests,
  memoryEmbeddingConfig,
} from "../agents/memory/memoryEmbeddingConfig.js";
import {
  formatEmbeddingForPg,
  searchMemoryEmbeddings,
} from "../agents/memory/memoryEmbeddings.js";
import { RECALL_AT5_GATE, RECALL_FIXTURE_CASES } from "./recallFixtures.js";

type Row = {
  user_profile_id: string;
  source_type: string;
  source_id: string;
  chunk_text: string;
  embedding: string;
  created_at: string;
  id: string;
};

function inMemoryEmbeddingsSupabase(store: Row[]): SupabaseClient {
  return {
    from(table: string) {
      if (table !== "memory_embeddings") {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        upsert(payload: Record<string, unknown>) {
          const key = `${payload.user_profile_id}:${payload.source_type}:${payload.source_id}`;
          const idx = store.findIndex(
            (r) =>
              `${r.user_profile_id}:${r.source_type}:${r.source_id}` === key,
          );
          const row: Row = {
            id: idx >= 0 ? store[idx]!.id : crypto.randomUUID(),
            user_profile_id: String(payload.user_profile_id),
            source_type: String(payload.source_type),
            source_id: String(payload.source_id),
            chunk_text: String(payload.chunk_text),
            embedding: String(payload.embedding),
            created_at: new Date().toISOString(),
          };
          if (idx >= 0) {
            store[idx] = row;
          } else {
            store.push(row);
          }
          return Promise.resolve({ error: null });
        },
        select(_cols: string) {
          return {
            eq(_col: string, userId: string) {
              return {
                limit(_n: number) {
                  const data = store.filter((r) => r.user_profile_id === userId);
                  return Promise.resolve({ data, error: null });
                },
                gte(_col2: string, _since: string) {
                  return {
                    limit(_n: number) {
                      const data = store.filter((r) => r.user_profile_id === userId);
                      return Promise.resolve({ data, error: null });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
    rpc() {
      return Promise.resolve({ data: null, error: { message: "use fallback in tests" } });
    },
  } as unknown as SupabaseClient;
}

describe("recall@5 fixture gate (Step 4)", () => {
  beforeEach(() => {
    process.env.MAGNUS_EMBED_PROVIDER = "fixture";
    process.env.MAGNUS_MEMORY_EMBEDDINGS_ENABLED = "true";
    resetMemoryEmbeddingConfigForTests();
  });

  afterEach(() => {
    delete process.env.MAGNUS_EMBED_PROVIDER;
    delete process.env.MAGNUS_MEMORY_EMBEDDINGS_ENABLED;
    resetMemoryEmbeddingConfigForTests();
  });

  it(`recall@5 ≥ ${RECALL_AT5_GATE * 100}% on ${RECALL_FIXTURE_CASES.length} seeded cases`, async () => {
    const store: Row[] = [];
    const sb = inMemoryEmbeddingsSupabase(store);
    const userId = "user-recall-fixture";
    const dim = memoryEmbeddingConfig().dimensions;

    for (const c of RECALL_FIXTURE_CASES) {
      const chunks = [c.targetChunk, ...c.decoys];
      for (let i = 0; i < chunks.length; i++) {
        const text = chunks[i]!;
        const embedding = fixtureEmbedText(text, dim);
        store.push({
          id: crypto.randomUUID(),
          user_profile_id: userId,
          source_type: "chat_turn",
          source_id: `${c.id}-${i}`,
          chunk_text: text,
          embedding: formatEmbeddingForPg(embedding),
          created_at: new Date().toISOString(),
        });
      }
    }

    let hits = 0;
    for (const c of RECALL_FIXTURE_CASES) {
      const results = await searchMemoryEmbeddings({
        userProfileId: userId,
        query: c.query,
        limit: 5,
        deps: { supabase: sb },
      });
      const topTexts = results.map((r) => r.chunk_text);
      if (topTexts.includes(c.targetChunk)) {
        hits += 1;
      }
    }

    const rate = hits / RECALL_FIXTURE_CASES.length;
    expect(rate).toBeGreaterThanOrEqual(RECALL_AT5_GATE);
  });
});
