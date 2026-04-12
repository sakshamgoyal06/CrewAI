const URL_RE = /\bhttps?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

/**
 * Extract HTTP(S) URLs from free text (deduped, order preserved).
 */
export function extractUrlsFromText(text: string, max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const matches = text.matchAll(URL_RE);
  for (const m of matches) {
    const u = trimTrailingPunctuation(m[0]);
    if (!seen.has(u) && out.length < max) {
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

function trimTrailingPunctuation(url: string): string {
  return url.replace(/[),.;:]+$/u, "");
}
