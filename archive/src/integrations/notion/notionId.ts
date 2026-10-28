/** Parse a Notion page/database URL or raw UUID into canonical UUID form. */
export function parseNotionId(input: string): string | null {
  const trimmed = input.trim();
  const match = trimmed.match(
    /([0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12})/i,
  );
  if (!match) {
    return null;
  }
  const hex = match[1].replace(/-/g, "").toLowerCase();
  if (hex.length !== 32) {
    return null;
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
