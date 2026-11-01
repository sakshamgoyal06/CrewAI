/**
 * Text → vector for memory recall. Provider: OpenAI, Voyage, hash fallback, or fixture (tests).
 */
import { logger } from "../../logger.js";
import { loggableError } from "../../util/loggableError.js";
import {
  memoryEmbeddingConfig,
  type EmbedProvider,
} from "./memoryEmbeddingConfig.js";

export function normalizeVector(values: number[]): number[] {
  const norm = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) {
    return values;
  }
  return values.map((v) => v / norm);
}

/** Deterministic local embed — structural fallback when no API key. */
export function hashEmbedText(text: string, dimensions: number): number[] {
  const vec = new Array<number>(dimensions).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [];
  for (const token of tokens) {
    let h = 2166136261;
    for (let i = 0; i < token.length; i++) {
      h ^= token.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % dimensions;
    vec[idx] = (vec[idx] ?? 0) + 1;
  }
  return normalizeVector(vec);
}

/** Fixture embed for recall@5 CI — one-hot per topic keyword bucket. */
const FIXTURE_TOPIC_BUCKETS: Array<{ keywords: string[]; index: number }> = [
  { keywords: ["job search", "ml roles", "interview"], index: 0 },
  { keywords: ["bali", "trip", "flight"], index: 1 },
  { keywords: ["gym", "workout", "training"], index: 2 },
  { keywords: ["meal", "protein", "diet"], index: 3 },
  { keywords: ["budget", "savings", "spending"], index: 4 },
  { keywords: ["spanish", "learning", "language"], index: 5 },
  { keywords: ["apartment", "rent", "lease"], index: 6 },
  { keywords: ["wedding", "ceremony", "guests"], index: 7 },
  { keywords: ["startup", "founder", "pitch"], index: 8 },
  { keywords: ["meditation", "mindfulness", "stress"], index: 9 },
  { keywords: ["dog", "pet", "vet"], index: 10 },
  { keywords: ["car", "insurance", "vehicle"], index: 11 },
  { keywords: ["visa", "passport", "immigration"], index: 12 },
  { keywords: ["doctor", "health", "checkup"], index: 13 },
  { keywords: ["book", "reading", "novel"], index: 14 },
  { keywords: ["music", "concert", "playlist"], index: 15 },
  { keywords: ["garden", "plants", "watering"], index: 16 },
  { keywords: ["tax", "filing", "deadline"], index: 17 },
  { keywords: ["team", "hiring", "manager"], index: 18 },
  { keywords: ["sleep", "insomnia", "bedtime"], index: 19 },
];

export function fixtureEmbedText(text: string, dimensions: number): number[] {
  const lower = text.toLowerCase();
  const vec = new Array<number>(dimensions).fill(0);
  for (const bucket of FIXTURE_TOPIC_BUCKETS) {
    if (bucket.keywords.some((k) => lower.includes(k))) {
      vec[bucket.index] = 1;
      return normalizeVector(vec);
    }
  }
  return hashEmbedText(text, dimensions);
}

async function openAiEmbed(text: string, dimensions: number, model: string): Promise<number[]> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY not set");
  }
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: text,
      dimensions,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI embed failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
  const embedding = json.data?.[0]?.embedding;
  if (!embedding?.length) {
    throw new Error("OpenAI embed returned empty vector");
  }
  return normalizeVector(embedding.slice(0, dimensions));
}

async function voyageEmbed(text: string, model: string): Promise<number[]> {
  const key = process.env.VOYAGE_API_KEY?.trim();
  if (!key) {
    throw new Error("VOYAGE_API_KEY not set");
  }
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [text],
    }),
  });
  if (!res.ok) {
    throw new Error(`Voyage embed failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
  const embedding = json.data?.[0]?.embedding;
  if (!embedding?.length) {
    throw new Error("Voyage embed returned empty vector");
  }
  return normalizeVector(embedding);
}

export async function embedText(
  text: string,
  overrides: { provider?: EmbedProvider; dimensions?: number; model?: string } = {},
): Promise<number[]> {
  const config = memoryEmbeddingConfig();
  const trimmed = text.trim();
  if (!trimmed) {
    return new Array(config.dimensions).fill(0);
  }

  const provider = overrides.provider ?? config.provider;
  const dimensions = overrides.dimensions ?? config.dimensions;
  const model = overrides.model ?? config.model;

  try {
    switch (provider) {
      case "openai":
        return await openAiEmbed(trimmed, dimensions, model);
      case "voyage":
        return await voyageEmbed(trimmed, model);
      case "fixture":
        return fixtureEmbedText(trimmed, dimensions);
      case "hash":
      default:
        return hashEmbedText(trimmed, dimensions);
    }
  } catch (e) {
    logger.warn({ err: loggableError(e), provider }, "embedText provider failed — hash fallback");
    return hashEmbedText(trimmed, dimensions);
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    na += (a[i] ?? 0) ** 2;
    nb += (b[i] ?? 0) ** 2;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
