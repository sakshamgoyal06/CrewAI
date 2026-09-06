import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("./memoryEmbeddings.js", () => ({
  searchMemoryEmbeddings: vi.fn().mockResolvedValue([]),
  indexTopicEmbedding: vi.fn().mockResolvedValue(undefined),
  indexMemoryChunk: vi.fn().mockResolvedValue(undefined),
}));

import {
  deriveTopicKey,
  factToTopicUpsert,
  formatMemoryTopicIndex,
  upsertMemoryTopic,
  upsertMemoryTopicsFromFacts,
  deleteMemoryTopicByKey,
  deleteMemoryTopicsMatching,
  loadMemoryTopics,
  normalizeMemoryMatchText,
  topicMatchesForgetQuery,
} from "./memoryTopics.js";

type Row = { topic_key: string; label: string; body: string; user_profile_id: string };

function inMemorySupabase(store: Row[]): SupabaseClient {
  const client = {
    from(table: string) {
      if (table !== "memory_topics") {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        upsert(payload: Record<string, unknown>) {
          const key = String(payload.topic_key);
          const idx = store.findIndex(
            (r) =>
              r.user_profile_id === payload.user_profile_id && r.topic_key === key,
          );
          const row: Row = {
            user_profile_id: String(payload.user_profile_id),
            topic_key: key,
            label: String(payload.label),
            body: String(payload.body),
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
                order(_col: string, _opts: { ascending: boolean }) {
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
        delete(_opts: { count: string }) {
          return {
            eq(_col: string, userId: string) {
              return {
                eq(_col2: string, topicKey: string) {
                  const before = store.length;
                  for (let i = store.length - 1; i >= 0; i--) {
                    if (
                      store[i]?.user_profile_id === userId &&
                      store[i]?.topic_key === topicKey
                    ) {
                      store.splice(i, 1);
                    }
                  }
                  const count = before - store.length;
                  return Promise.resolve({ error: null, count });
                },
              };
            },
          };
        },
      };
    },
  };
  return client as unknown as SupabaseClient;
}

describe("deriveTopicKey", () => {
  it("classifies preferences and rules", () => {
    expect(deriveTopicKey("User prefers morning workouts").topicKey.startsWith("preference:")).toBe(
      true,
    );
    expect(deriveTopicKey("Never schedule meetings before 9am").topicKey.startsWith("rule:")).toBe(
      true,
    );
  });

  it("produces stable keys for the same fact", () => {
    const a = deriveTopicKey("Timezone is Asia/Kolkata");
    const b = deriveTopicKey("Timezone is Asia/Kolkata");
    expect(a.topicKey).toBe(b.topicKey);
  });
});

describe("factToTopicUpsert", () => {
  it("maps fact text to upsert payload", () => {
    const upsert = factToTopicUpsert("Likes dal for dinner", "extract");
    expect(upsert.body).toBe("Likes dal for dinner");
    expect(upsert.source).toBe("extract");
    expect(upsert.topicKey.length).toBeGreaterThan(0);
  });
});

describe("formatMemoryTopicIndex", () => {
  it("formats label lines", () => {
    expect(
      formatMemoryTopicIndex([
        { topicKey: "preference:dal", label: "Likes dal" },
      ]),
    ).toEqual(["- Likes dal"]);
  });
});

describe("memory topic upsert", () => {
  it("dedupes by topic_key — 100 upserts stay one row per key", async () => {
    const store: Row[] = [];
    const sb = inMemorySupabase(store);
    const userId = "user-1";
    const fact = "User prefers morning workouts";

    for (let i = 0; i < 100; i++) {
      await upsertMemoryTopic(userId, factToTopicUpsert(fact), { supabase: sb });
    }

    expect(store.length).toBe(1);
    expect(store[0]?.body).toBe(fact);
  });

  it("merges multiple facts into distinct keys", async () => {
    const store: Row[] = [];
    const sb = inMemorySupabase(store);
    await upsertMemoryTopicsFromFacts(
      "user-1",
      ["Likes dal for dinner", "Never eat lauki"],
      { supabase: sb },
    );
    expect(store.length).toBe(2);
  });

  it("delete by key round-trips", async () => {
    const store: Row[] = [];
    const sb = inMemorySupabase(store);
    const topic = factToTopicUpsert("Remember gym on Mondays");
    await upsertMemoryTopic("user-1", topic, { supabase: sb });
    expect(store.length).toBe(1);

    const ok = await deleteMemoryTopicByKey("user-1", topic.topicKey, { supabase: sb });
    expect(ok).toBe(true);
    expect(store.length).toBe(0);
  });

  it("fuzzy delete matches label/body", async () => {
    const store: Row[] = [];
    const sb = inMemorySupabase(store);
    await upsertMemoryTopic("user-1", factToTopicUpsert("Allergic to peanuts"), { supabase: sb });
    const deleted = await deleteMemoryTopicsMatching("user-1", "peanut", { supabase: sb });
    expect(deleted).toBe(1);
    expect(store.length).toBe(0);
  });

  it("fuzzy delete matches UK spelling and partial phrases", async () => {
    const store: Row[] = [];
    const sb = inMemorySupabase(store);
    await upsertMemoryTopic(
      "user-1",
      factToTopicUpsert("my favorite color is black", "user"),
      { supabase: sb },
    );

    expect(
      topicMatchesForgetQuery(
        {
          id: "1",
          user_profile_id: "user-1",
          topic_key: "preference:my_favorite_color_is_black",
          label: "my favorite color is black",
          body: "my favorite color is black",
          source: "user",
          created_at: "",
          updated_at: "",
        },
        "my favourite color",
      ),
    ).toBe(true);

    const deleted = await deleteMemoryTopicsMatching("user-1", "my favourite color", {
      supabase: sb,
    });
    expect(deleted).toBe(1);
    expect(store.length).toBe(0);
  });

  it("normalizeMemoryMatchText folds UK spellings", () => {
    expect(normalizeMemoryMatchText("my favourite colour")).toBe("my favorite color");
  });

  it("load returns upserted topics", async () => {
    const store: Row[] = [];
    const sb = inMemorySupabase(store);
    await upsertMemoryTopic("user-1", factToTopicUpsert("Likes tea"), { supabase: sb });
    const topics = await loadMemoryTopics("user-1", 10, { supabase: sb });
    expect(topics).toHaveLength(1);
    expect(topics[0]?.body).toBe("Likes tea");
  });
});
