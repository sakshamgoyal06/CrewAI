/**
 * Telegram text limit is 4096 characters. Split plain text before HTML conversion
 * so escaped markup does not push chunks over the limit.
 */
export const TELEGRAM_MAX_MESSAGE_CHARS = 4096;

/** Headroom for HTML tags after `markdownishToTelegramHtml`. */
export const TELEGRAM_SAFE_PLAIN_CHUNK = 3500;

function splitLongRun(s: string, maxLen: number): string[] {
  if (s.length <= maxLen) {
    return [s];
  }
  const lines = s.split("\n");
  const out: string[] = [];
  let buf = "";
  for (const line of lines) {
    if (line.length > maxLen) {
      if (buf) {
        out.push(buf);
        buf = "";
      }
      for (let i = 0; i < line.length; i += maxLen) {
        out.push(line.slice(i, i + maxLen));
      }
      continue;
    }
    const sep = buf ? "\n" : "";
    if (buf.length + sep.length + line.length <= maxLen) {
      buf = buf ? buf + sep + line : line;
    } else {
      if (buf) {
        out.push(buf);
      }
      buf = line;
    }
  }
  if (buf) {
    out.push(buf);
  }
  return out;
}

/**
 * Split long assistant text on paragraph boundaries, then hard-split oversized runs.
 */
export function splitPlainForTelegram(
  text: string,
  maxLen = TELEGRAM_SAFE_PLAIN_CHUNK,
): string[] {
  if (text.length <= maxLen) {
    return [text];
  }
  const paras = text.split(/\n\n+/);
  const out: string[] = [];
  let buf = "";
  const flush = () => {
    if (buf) {
      out.push(buf);
      buf = "";
    }
  };
  for (const p of paras) {
    if (p.length > maxLen) {
      flush();
      out.push(...splitLongRun(p, maxLen));
      continue;
    }
    const sep = buf ? "\n\n" : "";
    if (buf.length + sep.length + p.length <= maxLen) {
      buf = buf ? buf + sep + p : p;
    } else {
      flush();
      buf = p;
    }
  }
  flush();
  return out;
}
