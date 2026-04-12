/**
 * Shared types for research tooling (fetch, gather, synthesis).
 */
export type ResearchCitation = {
  title: string;
  url: string;
  /** One-line relevance note (filled by the model in final output; optional at gather time). */
  relevance?: string;
};

export type GatheredSource = {
  url: string;
  title: string;
  /** Truncated plain text for the model context. */
  excerpt: string;
};

export type ResearchGatherResult = {
  sources: GatheredSource[];
  /** Long pasted block from the user message (no URL), when present. */
  pastedExcerpt?: string;
  /** Optional query used when a search API was invoked. */
  searchQuery?: string;
};

export type ResearchGatherDeps = {
  fetchImpl?: typeof fetch;
  fetchTimeoutMs?: number;
  maxResponseBytes?: number;
  maxUrls?: number;
};
