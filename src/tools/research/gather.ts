import { fetchPageExcerpt } from "./fetch.js";
import { searchWebAndFetch } from "./search.js";
import type { ResearchGatherDeps, ResearchGatherResult } from "./types.js";
import { extractUrlsFromText } from "./urls.js";

const PASTE_MIN_CHARS = 400;
const MAX_URLS_DEFAULT = 3;

/**
 * Derive a search query from the user message (first line or truncated).
 */
export function deriveSearchQuery(rawMessage: string): string {
  const line = rawMessage.split(/\r?\n/).find((l) => l.trim().length > 0) ?? rawMessage;
  const q = line.trim();
  if (q.length > 240) {
    return `${q.slice(0, 240)}…`;
  }
  return q;
}

/**
 * Long non-URL pasted text blocks (e.g. article body in chat).
 */
export function extractPastedExcerpt(rawMessage: string): string | undefined {
  const parts = rawMessage.split(/\r?\n\r?\n/);
  for (const p of parts) {
    const t = p.trim();
    if (t.length >= PASTE_MIN_CHARS && !/\bhttps?:\/\//i.test(t)) {
      return t.length > 12_000 ? `${t.slice(0, 12_000)}…` : t;
    }
  }
  if (rawMessage.trim().length >= PASTE_MIN_CHARS && !/\bhttps?:\/\//i.test(rawMessage)) {
    const t = rawMessage.trim();
    return t.length > 12_000 ? `${t.slice(0, 12_000)}…` : t;
  }
  return undefined;
}

/**
 * Fetch URLs from the message and/or run optional web search when no URLs and API key is set.
 */
export async function gatherResearchMaterials(
  rawMessage: string,
  deps: ResearchGatherDeps = {},
): Promise<ResearchGatherResult> {
  const maxUrls = deps.maxUrls ?? MAX_URLS_DEFAULT;
  const urls = extractUrlsFromText(rawMessage, maxUrls);
  const pastedExcerpt = extractPastedExcerpt(rawMessage);
  const sources: ResearchGatherResult["sources"] = [];

  for (const u of urls) {
    const r = await fetchPageExcerpt(u, {
      fetchImpl: deps.fetchImpl,
      timeoutMs: deps.fetchTimeoutMs,
      maxBytes: deps.maxResponseBytes,
    });
    if (r.ok) {
      sources.push(r.source);
    }
  }

  let searchQuery: string | undefined;
  if (sources.length === 0 && !pastedExcerpt) {
    const q = deriveSearchQuery(rawMessage);
    const searched = await searchWebAndFetch(q, {
      fetchImpl: deps.fetchImpl,
      maxResults: maxUrls,
    });
    sources.push(...searched.sources);
    searchQuery = searched.searchQuery;
  }

  return {
    sources,
    pastedExcerpt,
    searchQuery,
  };
}
