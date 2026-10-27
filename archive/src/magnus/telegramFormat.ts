/**
 * Convert assistant Markdown-ish text to Telegram HTML (allowed tags only).
 * @see https://core.telegram.org/bots/api#html-style
 */

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const LINK_PH = "\uE000LINK";

/** Inline: **bold**, [label](https://url), `code` */
export function formatInline(line: string): string {
  const slots: string[] = [];
  let s = line.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (_, label: string, url: string) => {
    const i = slots.length;
    slots.push(`<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`);
    return `${LINK_PH}${i}${LINK_PH}`;
  });

  s = s.replace(/`([^`]+)`/g, (_, code: string) => {
    const i = slots.length;
    slots.push(`<code>${escapeHtml(code)}</code>`);
    return `${LINK_PH}${i}${LINK_PH}`;
  });

  const parts = s.split(/\*\*/);
  let out = parts
    .map((p, i) => (i % 2 === 0 ? escapeHtml(p) : `<b>${escapeHtml(p)}</b>`))
    .join("");

  for (let i = 0; i < slots.length; i++) {
    out = out.replace(`${LINK_PH}${i}${LINK_PH}`, slots[i]!);
  }
  return out;
}

/**
 * Block-level Markdown-ish → Telegram HTML (no <ul>; bullets use •).
 */
export function markdownishToTelegramHtml(md: string): string {
  if (!md.trim()) {
    return "";
  }
  const lines = md.split("\n");
  const blocks: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i]!;
    const trimmed = raw.trimEnd();
    if (trimmed === "") {
      i++;
      continue;
    }

    if (/^#{1,3}\s+/.test(trimmed)) {
      const text = trimmed.replace(/^#{1,3}\s+/, "");
      blocks.push(`<b>${escapeHtml(text)}</b>`);
      i++;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const listLines: string[] = [];
      while (i < lines.length) {
        const L = lines[i]!.trimEnd();
        if (/^[-*]\s+/.test(L)) {
          listLines.push(L.replace(/^[-*]\s+/, ""));
          i++;
        } else if (L === "") {
          i++;
          break;
        } else {
          break;
        }
      }
      for (const item of listLines) {
        blocks.push(`• ${formatInline(item)}`);
      }
      continue;
    }

    const para: string[] = [trimmed];
    i++;
    while (i < lines.length) {
      const next = lines[i]!.trimEnd();
      if (next === "") break;
      if (/^#{1,3}\s+/.test(next) || /^[-*]\s+/.test(next)) break;
      para.push(next);
      i++;
    }
    // Telegram HTML does not support <p> or <br>; use literal newlines for soft breaks.
    blocks.push(para.map((line) => formatInline(line)).join("\n"));
  }

  return blocks.join("\n\n");
}
