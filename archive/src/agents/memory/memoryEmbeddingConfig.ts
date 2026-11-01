/**
 * Step 4 — embedding / recall configuration (`MAGNUS_MEMORY_EMBED_*`, `MAGNUS_EMBED_*`).
 */

export type EmbedProvider = "openai" | "voyage" | "hash" | "fixture";

export type MemoryEmbeddingConfig = {
  enabled: boolean;
  dimensions: number;
  provider: EmbedProvider;
  model: string;
  indexJournal: boolean;
  indexTopics: boolean;
  indexChatTurns: boolean;
  defaultRecallLimit: number;
};

let cached: MemoryEmbeddingConfig | null = null;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  if (raw === "true" || raw === "1" || raw === "yes") {
    return true;
  }
  if (raw === "false" || raw === "0" || raw === "no") {
    return false;
  }
  return fallback;
}

function envStr(name: string, fallback: string): string {
  const raw = process.env[name]?.trim();
  return raw || fallback;
}

function resolveProvider(): EmbedProvider {
  const explicit = process.env.MAGNUS_EMBED_PROVIDER?.trim().toLowerCase();
  if (
    explicit === "openai" ||
    explicit === "voyage" ||
    explicit === "hash" ||
    explicit === "fixture"
  ) {
    return explicit;
  }
  if (process.env.OPENAI_API_KEY?.trim()) {
    return "openai";
  }
  if (process.env.VOYAGE_API_KEY?.trim()) {
    return "voyage";
  }
  if (process.env.NODE_ENV === "test") {
    return "fixture";
  }
  return "hash";
}

export function memoryEmbeddingConfig(): MemoryEmbeddingConfig {
  if (cached) {
    return cached;
  }
  cached = {
    enabled: envBool("MAGNUS_MEMORY_EMBEDDINGS_ENABLED", true),
    dimensions: envInt("MAGNUS_EMBED_DIMENSIONS", 384),
    provider: resolveProvider(),
    model: envStr("MAGNUS_EMBED_MODEL", "text-embedding-3-small"),
    indexJournal: envBool("MAGNUS_MEMORY_EMBED_JOURNAL", true),
    indexTopics: envBool("MAGNUS_MEMORY_EMBED_TOPICS", true),
    indexChatTurns: envBool("MAGNUS_MEMORY_EMBED_CHAT_TURNS", true),
    defaultRecallLimit: envInt("MAGNUS_MEMORY_RECALL_DEFAULT_LIMIT", 5),
  };
  return cached;
}

export function resetMemoryEmbeddingConfigForTests(): void {
  cached = null;
}
