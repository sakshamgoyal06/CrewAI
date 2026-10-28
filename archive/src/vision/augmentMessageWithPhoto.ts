import type { PhotoContext } from "./types.js";

/** Append vision analysis to the user message so parsers and agents see photo content as text. */
export function augmentMessageWithPhotoContext(
  userMessage: string,
  photoContext: PhotoContext,
): string {
  const base = userMessage.trim() || "[photo]";
  const a = photoContext.analysis;
  const lines = [
    base,
    "",
    "[Photo attached — vision summary for this turn]",
    a.description,
  ];

  if (a.extracted_text?.trim()) {
    lines.push("", `Text visible in image: ${a.extracted_text.trim()}`);
  }
  if (a.extracted_items?.length) {
    lines.push("", `Items detected: ${a.extracted_items.join("; ")}`);
  }

  return lines.join("\n");
}
