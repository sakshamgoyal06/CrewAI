import { stripDangerousHtmlRegions } from "./sanitize.js";

const TAG_RE = /<[^>]+>/g;
const WS_RE = /\s+/g;

export function extractTitleFromHtml(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (m?.[1]) {
    return decodeBasicEntities(m[1].replace(TAG_RE, " ").replace(WS_RE, " ")).trim();
  }
  const og = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
  );
  if (og?.[1]) {
    return decodeBasicEntities(og[1].trim());
  }
  return "";
}

export function htmlToReadableText(html: string, maxChars: number): string {
  const cleaned = stripDangerousHtmlRegions(html);
  const noTags = cleaned
    .replace(TAG_RE, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(WS_RE, " ")
    .trim();
  const decoded = decodeBasicEntities(noTags);
  if (decoded.length <= maxChars) {
    return decoded;
  }
  return `${decoded.slice(0, maxChars)}…`;
}

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}
