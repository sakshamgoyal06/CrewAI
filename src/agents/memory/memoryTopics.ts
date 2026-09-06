/**
 * Step 2 — curated memory topics (Claude-style): upsert by topic_key, index in prompts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "../../logger.js";
import { supabase as defaultSupabase } from "../../tools/clients.js";
import { loggableError } from "../../util/loggableError.js";

export type MemoryTopicRow = {
  id: string;
  user_profile_id: string;
  topic_key: string;
  label: string;
  body: string;
  source: string | null;
  created_at: string;
  updated_at: string;
};

export type MemoryTopicIndexEntry = {
  topicKey: string;
  label: string;
};

export type MemoryTopicUpsert = {
  topicKey: string;
  label: string;
  body: string;
  source?: string;
};

const TOPIC_KEY_MAX = 96;
const LABEL_MAX = 120;
const BODY_MAX = 2000;

/** Normalize free text into a stable topic_key + short label. */
export function deriveTopicKey(fact: string): { topicKey: string; label: string } {
  const trimmed = fact.trim();
  const lower = trimmed.toLowerCase();

  let prefix = "fact";
  if (/\b(?:avoid|never|don'?t|except|rule)\b/i.test(lower)) {
    prefix = "rule";
  } else if (/\b(?:prefers?|likes?|favorite|usually)\b/i.test(lower)) {
    prefix = "preference";
  } else if (/\b(?:goal|target|north star|aim)\b/i.test(lower)) {
    prefix = "goal";
  } else if (/\b(?:timezone|schedule|meeting|calendar)\b/i.test(lower)) {
    prefix = "schedule";
  }

  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);

  const topicKey = `${prefix}:${slug || "general"}`.slice(0, TOPIC_KEY_MAX);
  const label =
    trimmed.length <= LABEL_MAX ? trimmed : `${trimmed.slice(0, LABEL_MAX - 1)}…`;

  return { topicKey, label };
}

export function factToTopicUpsert(fact: string, source = "extract"): MemoryTopicUpsert {
  const { topicKey, label } = deriveTopicKey(fact);
  return {
    topicKey,
    label,
    body: fact.trim().slice(0, BODY_MAX),
    source,
  };
}

export async function loadMemoryTopicIndex(
  userProfileId: string,
  limit: number,
  deps: { supabase?: SupabaseClient } = {},
): Promise<MemoryTopicIndexEntry[]> {
  const sb = deps.supabase ?? defaultSupabase;
  const { data, error } = await sb
    .from("memory_topics")
    .select("topic_key, label")
    .eq("user_profile_id", userProfileId)
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, limit));

  if (error) {
    logger.warn({ err: loggableError(error), userProfileId }, "memory: topic index load failed");
    return [];
  }

  return (data ?? []).map((row) => ({
    topicKey: String(row.topic_key),
    label: String(row.label),
  }));
}

export async function loadMemoryTopics(
  userProfileId: string,
  limit: number,
  deps: { supabase?: SupabaseClient } = {},
): Promise<MemoryTopicRow[]> {
  const sb = deps.supabase ?? defaultSupabase;
  const { data, error } = await sb
    .from("memory_topics")
    .select("*")
    .eq("user_profile_id", userProfileId)
    .order("updated_at", { ascending: false })
    .limit(Math.max(1, limit));

  if (error) {
    logger.warn({ err: loggableError(error), userProfileId }, "memory: topics load failed");
    return [];
  }

  return (data ?? []) as MemoryTopicRow[];
}

export async function upsertMemoryTopic(
  userProfileId: string,
  topic: MemoryTopicUpsert,
  deps: { supabase?: SupabaseClient } = {},
): Promise<void> {
  const sb = deps.supabase ?? defaultSupabase;
  const now = new Date().toISOString();
  const { error } = await sb.from("memory_topics").upsert(
    {
      user_profile_id: userProfileId,
      topic_key: topic.topicKey.slice(0, TOPIC_KEY_MAX),
      label: topic.label.slice(0, LABEL_MAX),
      body: topic.body.slice(0, BODY_MAX),
      source: topic.source ?? "extract",
      updated_at: now,
    },
    { onConflict: "user_profile_id,topic_key" },
  );

  if (error) {
    logger.warn(
      { err: loggableError(error), userProfileId, topicKey: topic.topicKey },
      "memory: topic upsert failed",
    );
  }
}

export async function upsertMemoryTopicsFromFacts(
  userProfileId: string,
  facts: string[],
  deps: { supabase?: SupabaseClient } = {},
): Promise<void> {
  for (const fact of facts) {
    if (!fact.trim()) {
      continue;
    }
    await upsertMemoryTopic(userProfileId, factToTopicUpsert(fact), deps);
  }
}

export async function deleteMemoryTopicByKey(
  userProfileId: string,
  topicKey: string,
  deps: { supabase?: SupabaseClient } = {},
): Promise<boolean> {
  const sb = deps.supabase ?? defaultSupabase;
  const { error, count } = await sb
    .from("memory_topics")
    .delete({ count: "exact" })
    .eq("user_profile_id", userProfileId)
    .eq("topic_key", topicKey);

  if (error) {
    logger.warn({ err: loggableError(error), userProfileId, topicKey }, "memory: topic delete failed");
    return false;
  }
  return (count ?? 0) > 0;
}

/** Fuzzy delete: match label or body containing query (case-insensitive). */
export async function deleteMemoryTopicsMatching(
  userProfileId: string,
  query: string,
  deps: { supabase?: SupabaseClient } = {},
): Promise<number> {
  const q = query.trim().toLowerCase();
  if (!q) {
    return 0;
  }
  const topics = await loadMemoryTopics(userProfileId, 200, deps);
  let deleted = 0;
  for (const t of topics) {
    if (
      t.topic_key.toLowerCase().includes(q) ||
      t.label.toLowerCase().includes(q) ||
      t.body.toLowerCase().includes(q)
    ) {
      const ok = await deleteMemoryTopicByKey(userProfileId, t.topic_key, deps);
      if (ok) {
        deleted += 1;
      }
    }
  }
  return deleted;
}

export async function rememberMemoryTopic(
  userProfileId: string,
  body: string,
  deps: { supabase?: SupabaseClient } = {},
): Promise<MemoryTopicUpsert> {
  const topic = factToTopicUpsert(body, "user");
  await upsertMemoryTopic(userProfileId, topic, deps);
  return topic;
}

export function formatMemoryTopicIndex(entries: MemoryTopicIndexEntry[]): string[] {
  return entries.map((e) => `- ${e.label}`);
}
