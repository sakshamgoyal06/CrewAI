import { extractTitleFromHtml, htmlToReadableText } from "./extract.js";
import type { GatheredSource } from "./types.js";

const DEFAULT_TIMEOUT_MS = Number.parseInt(
  process.env.MAGNUS_RESEARCH_FETCH_TIMEOUT_MS?.trim() || "15000",
  10,
);
const DEFAULT_MAX_BYTES = Number.parseInt(
  process.env.MAGNUS_RESEARCH_MAX_RESPONSE_BYTES?.trim() || String(2 * 1024 * 1024),
  10,
);
const EXCERPT_CHARS = 4000;

export type FetchPageResult =
  | { ok: true; source: GatheredSource }
  | { ok: false; url: string; error: string };

function getFetchFn(impl?: typeof fetch): typeof fetch {
  return impl ?? globalThis.fetch.bind(globalThis);
}

/**
 * Fetch a URL with timeout and size cap; extract title + plain excerpt. Does not execute remote code.
 */
export async function fetchPageExcerpt(
  url: string,
  options: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    maxBytes?: number;
  } = {},
): Promise<FetchPageResult> {
  const timeoutMs = Number.isNaN(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    ? 15000
    : (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const maxBytes = Number.isNaN(options.maxBytes ?? DEFAULT_MAX_BYTES)
    ? 2 * 1024 * 1024
    : (options.maxBytes ?? DEFAULT_MAX_BYTES);
  const fetchFn = getFetchFn(options.fetchImpl);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, {
      signal: ac.signal,
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        "User-Agent": "MagnusResearchBot/1.0 (+https://github.com/)",
      },
    });
    if (!res.ok) {
      return { ok: false, url, error: `HTTP ${res.status}` };
    }
    const buf = await readBodyWithCap(res, maxBytes);
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    const title = extractTitleFromHtml(text) || hostnameTitle(url);
    const excerpt = htmlToReadableText(text, EXCERPT_CHARS);
    return {
      ok: true,
      source: {
        url,
        title,
        excerpt: excerpt || "(no extractable text)",
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, url, error: msg };
  } finally {
    clearTimeout(t);
  }
}

async function readBodyWithCap(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) {
    return new Uint8Array();
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    if (total + value.byteLength > maxBytes) {
      chunks.push(value.slice(0, maxBytes - total));
      total = maxBytes;
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function hostnameTitle(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
