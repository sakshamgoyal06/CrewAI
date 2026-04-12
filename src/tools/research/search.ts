import { logger } from "../../logger.js";
import { fetchPageExcerpt } from "./fetch.js";
import type { GatheredSource } from "./types.js";

/**
 * Optional SerpAPI (Google) search — requires MAGNUS_SERPAPI_KEY in env.
 * Returns top organic result URLs (not ads). Fetches first N pages for excerpts.
 */
export async function searchWebAndFetch(
  query: string,
  options: {
    fetchImpl?: typeof fetch;
    maxResults?: number;
    serpApiKey?: string;
  } = {},
): Promise<{ sources: GatheredSource[]; searchQuery: string }> {
  const key =
    options.serpApiKey?.trim() ||
    process.env.MAGNUS_SERPAPI_KEY?.trim() ||
    process.env.SERPAPI_API_KEY?.trim();
  if (!key || !query.trim()) {
    return { sources: [], searchQuery: query.trim() };
  }
  const maxResults = options.maxResults ?? 3;
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query.trim());
  url.searchParams.set("api_key", key);
  url.searchParams.set("num", String(Math.min(10, maxResults + 2)));

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 12_000);
  let organic: { link?: string; title?: string }[] = [];
  try {
    const res = await (options.fetchImpl ?? globalThis.fetch)(url.toString(), {
      signal: ac.signal,
    });
    const rawText = await res.text();
    let json: {
      organic_results?: { link?: string; title?: string }[];
      error?: string;
    };
    try {
      json = JSON.parse(rawText) as typeof json;
    } catch {
      logger.warn(
        { status: res.status, querySnippet: query.trim().slice(0, 100) },
        "serpapi: non-JSON response",
      );
      return { sources: [], searchQuery: query.trim() };
    }
    if (!res.ok || json.error) {
      logger.warn(
        {
          status: res.status,
          serpError: json.error ?? null,
          querySnippet: query.trim().slice(0, 100),
        },
        "serpapi: search failed",
      );
      return { sources: [], searchQuery: query.trim() };
    }
    organic = json.organic_results ?? [];
    if (organic.length === 0) {
      logger.debug(
        { querySnippet: query.trim().slice(0, 100) },
        "serpapi: no organic_results",
      );
    }
  } catch (err) {
    logger.warn(
      { err: String(err), querySnippet: query.trim().slice(0, 100) },
      "serpapi: request error",
    );
    return { sources: [], searchQuery: query.trim() };
  } finally {
    clearTimeout(t);
  }

  const sources: GatheredSource[] = [];
  for (const item of organic) {
    const link = item.link?.trim();
    if (!link || !/^https?:\/\//i.test(link)) {
      continue;
    }
    const fetched = await fetchPageExcerpt(link, { fetchImpl: options.fetchImpl });
    if (fetched.ok) {
      if (item.title && !fetched.source.title) {
        fetched.source.title = item.title;
      }
      sources.push(fetched.source);
    }
    if (sources.length >= maxResults) {
      break;
    }
  }

  return { sources, searchQuery: query.trim() };
}
