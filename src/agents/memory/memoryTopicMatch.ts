/**
 * Hybrid memory-topic matching for forget commands.
 *
 * Industry pattern (Mem0, etc.): fuse keyword/phrase signals with optional semantic
 * similarity — destructive deletes require a confidence threshold and disambiguate
 * when multiple topics score similarly.
 */
import type { MemoryTopicRow } from "./memoryTopics.js";
import { searchMemoryEmbeddings } from "./memoryEmbeddings.js";

/** UK → US normalizations for fuzzy matching. */
const UK_US_SPELLING: Record<string, string> = {
  favourite: "favorite",
  favourites: "favorites",
  colour: "color",
  colours: "colors",
  behaviour: "behavior",
  behaviours: "behaviors",
  organise: "organize",
  organised: "organized",
  organising: "organizing",
  centre: "center",
  centres: "centers",
  metre: "meter",
  metres: "meters",
  analyse: "analyze",
  analysed: "analyzed",
  travelling: "traveling",
  travelled: "traveled",
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "about",
  "are",
  "for",
  "i",
  "in",
  "is",
  "it",
  "its",
  "me",
  "my",
  "of",
  "our",
  "that",
  "the",
  "this",
  "to",
  "was",
  "we",
  "were",
  "your",
  "remember",
  "forget",
]);

/** Minimum fused score to consider a topic for deletion. */
export const FORGET_MATCH_MIN_SCORE = 0.62;

/** Top two scores within this gap → ask user to disambiguate. */
export const FORGET_AMBIGUITY_SCORE_GAP = 0.12;

export type TopicMatchSignals = {
  phrase: number;
  topicKey: number;
  tokenCoverage: number;
  semantic: number;
};

export type ScoredTopicMatch = {
  topic: MemoryTopicRow;
  score: number;
  signals: TopicMatchSignals;
};

export type ForgetResolveResult =
  | { status: "none" }
  | { status: "clear"; matches: ScoredTopicMatch[] }
  | { status: "ambiguous"; matches: ScoredTopicMatch[] };

/** Normalize text for case-insensitive memory topic matching. */
export function normalizeMemoryMatchText(text: string): string {
  let normalized = text
    .normalize("NFKC")
    .toLowerCase()
    .trim();

  for (const [uk, us] of Object.entries(UK_US_SPELLING)) {
    normalized = normalized.replace(new RegExp(`\\b${uk}\\b`, "g"), us);
  }

  return normalized
    .replace(/[''`]/g, "")
    .replace(/[_:/]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Significant tokens from a forget query (stop words removed). */
export function forgetQueryTokens(query: string): string[] {
  return normalizeMemoryMatchText(query)
    .split(" ")
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token));
}

function topicKeySlug(topicKey: string): string {
  const idx = topicKey.indexOf(":");
  return idx >= 0 ? topicKey.slice(idx + 1) : topicKey;
}

function querySlug(query: string): string {
  return forgetQueryTokens(query).join("_").slice(0, 48);
}

function tokenVariants(token: string): string[] {
  const variants = new Set<string>([token]);
  if (token.length > 3 && token.endsWith("s")) {
    variants.add(token.slice(0, -1));
  }
  if (token.length > 2 && !token.endsWith("s")) {
    variants.add(`${token}s`);
  }
  if (token.length > 4 && token.endsWith("ing")) {
    variants.add(token.slice(0, -3));
  }
  return [...variants];
}

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) {
    return true;
  }
  const lenDiff = Math.abs(a.length - b.length);
  if (lenDiff > 1) {
    return false;
  }
  if (lenDiff === 1) {
    const [shorter, longer] = a.length < b.length ? [a, b] : [b, a];
    for (let i = 0; i < longer.length; i++) {
      if (longer.slice(0, i) + longer.slice(i + 1) === shorter) {
        return true;
      }
    }
    return false;
  }
  let mismatches = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      mismatches += 1;
      if (mismatches > 1) {
        return false;
      }
    }
  }
  return mismatches === 1;
}

function haystackTokens(haystack: string): Set<string> {
  return new Set(haystack.split(" ").filter(Boolean));
}

function tokenMatchesHaystack(token: string, tokens: Set<string>, haystack: string): boolean {
  for (const variant of tokenVariants(token)) {
    if (tokens.has(variant) || haystack.includes(variant)) {
      return true;
    }
    if (variant.length >= 5) {
      for (const candidate of tokens) {
        if (editDistanceAtMostOne(variant, candidate)) {
          return true;
        }
      }
    }
  }
  return false;
}

function topicMatchHaystack(topic: MemoryTopicRow): string {
  return normalizeMemoryMatchText(`${topic.topic_key} ${topic.label} ${topic.body}`);
}

export function scoreTopicForgetMatch(
  topic: MemoryTopicRow,
  query: string,
  semanticSimilarity = 0,
): ScoredTopicMatch {
  const normalizedQuery = normalizeMemoryMatchText(query);
  const haystack = topicMatchHaystack(topic);
  const tokens = forgetQueryTokens(query);
  const hayTokens = haystackTokens(haystack);

  const phrase =
    normalizedQuery.length >= 8 && haystack.includes(normalizedQuery) ? 1 : 0;

  const slug = querySlug(query);
  const keySlug = topicKeySlug(topic.topic_key);
  let topicKey = 0;
  if (slug && keySlug) {
    if (keySlug === slug) {
      topicKey = 1;
    } else if (keySlug.includes(slug) || slug.includes(keySlug)) {
      topicKey = 0.85;
    }
  }

  let matchedTokenCount = 0;
  if (tokens.length > 0) {
    for (const token of tokens) {
      if (tokenMatchesHaystack(token, hayTokens, haystack)) {
        matchedTokenCount += 1;
      }
    }
  }
  const tokenCoverage = tokens.length > 0 ? matchedTokenCount / tokens.length : 0;

  const semantic = semanticSimilarity > 0 ? Math.min(1, semanticSimilarity) : 0;

  let score = Math.min(
    1,
    phrase * 0.35 +
      topicKey * 0.25 +
      tokenCoverage * 0.25 +
      semantic * 0.15 +
      (phrase >= 1 ? 0.1 : 0) +
      (tokenCoverage >= 1 && tokens.length >= 2 ? 0.08 : 0),
  );

  // Single distinctive token (e.g. "lauki", "peanut") — slug or label anchor.
  if (tokens.length === 1 && tokenCoverage >= 1) {
    const token = tokens[0]!;
    if (
      token.length >= 4 &&
      (keySlug.includes(token) ||
        normalizeMemoryMatchText(topic.label).split(" ").includes(token))
    ) {
      score = Math.max(score, 0.72);
    }
  }

  // Semantic-only path (Mem0-style): high similarity when keywords are weak.
  if (semantic >= 0.78) {
    score = Math.max(score, semantic * 0.88);
  }

  return {
    topic,
    score,
    signals: { phrase, topicKey, tokenCoverage, semantic },
  };
}

export function rankTopicsForForgetQuery(
  topics: MemoryTopicRow[],
  query: string,
  semanticByTopicKey: ReadonlyMap<string, number> = new Map(),
): ScoredTopicMatch[] {
  return topics
    .map((topic) =>
      scoreTopicForgetMatch(topic, query, semanticByTopicKey.get(topic.topic_key) ?? 0),
    )
    .filter((match) => match.score >= FORGET_MATCH_MIN_SCORE)
    .sort((a, b) => b.score - a.score);
}

export function resolveForgetMatches(matches: ScoredTopicMatch[]): ForgetResolveResult {
  if (matches.length === 0) {
    return { status: "none" };
  }
  if (matches.length === 1) {
    return { status: "clear", matches };
  }

  const [top, second] = matches;
  if (top.score - second.score >= FORGET_AMBIGUITY_SCORE_GAP) {
    return { status: "clear", matches: [top] };
  }

  const nearTop = matches.filter((m) => top.score - m.score < FORGET_AMBIGUITY_SCORE_GAP);
  if (nearTop.length === 1) {
    return { status: "clear", matches: nearTop };
  }

  return { status: "ambiguous", matches: nearTop };
}

/** Whether a stored topic matches a forget query (used in tests / simple checks). */
export function topicMatchesForgetQuery(topic: MemoryTopicRow, query: string): boolean {
  return scoreTopicForgetMatch(topic, query).score >= FORGET_MATCH_MIN_SCORE;
}

export async function rankTopicsForForgetQueryWithSemantic(input: {
  userProfileId: string;
  topics: MemoryTopicRow[];
  query: string;
}): Promise<ScoredTopicMatch[]> {
  const semanticByTopicKey = new Map<string, number>();
  try {
    const rows = await searchMemoryEmbeddings({
      userProfileId: input.userProfileId,
      query: input.query,
      limit: 8,
    });
    for (const row of rows) {
      if (row.source_type !== "topic") {
        continue;
      }
      const prev = semanticByTopicKey.get(row.source_id) ?? 0;
      semanticByTopicKey.set(row.source_id, Math.max(prev, row.similarity));
    }
  } catch {
    // Keyword-only fallback when embeddings unavailable.
  }

  return rankTopicsForForgetQuery(input.topics, input.query, semanticByTopicKey);
}
