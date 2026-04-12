/**
 * Strip tags and regions that must never be interpreted as content or executed.
 * Does not execute scripts — this is string-only cleanup before text extraction.
 */
export function stripDangerousHtmlRegions(html: string): string {
  let s = html;
  const removeBlock = (re: RegExp) => {
    s = s.replace(re, " ");
  };
  removeBlock(/<script\b[^>]*>[\s\S]*?<\/script>/gi);
  removeBlock(/<style\b[^>]*>[\s\S]*?<\/style>/gi);
  removeBlock(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi);
  removeBlock(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi);
  removeBlock(/<object\b[^>]*>[\s\S]*?<\/object>/gi);
  removeBlock(/<embed\b[^>]*>/gi);
  return s;
}
