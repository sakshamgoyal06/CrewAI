/**
 * Step 5 — read-before-write guards for calendar and list mutations (same turn).
 * Blocks id-based writes until a read tool ran earlier in the agent loop.
 */
export const READ_BEFORE_WRITE_PREFIX = "Read first:";

const CALENDAR_READ_TOOLS = new Set(["read_calendar", "read_tool_artifact"]);

const CALENDAR_ID_WRITE_TOOLS = new Set(["update_calendar_event", "delete_calendar_event"]);

const LIST_READ_TOOLS = new Set([
  "list_items",
  "list_catalog",
  "lookup_list_item",
  "list_notion_items",
  "recommend_list_items",
]);

const LIST_ID_WRITE_TOOLS = new Set(["update_list_item", "update_notion_item"]);

export function checkReadBeforeWrite(
  toolName: string,
  toolsUsedSoFar: readonly string[],
): { blocked: true; message: string } | { blocked: false } {
  const prior = new Set(toolsUsedSoFar);

  if (CALENDAR_ID_WRITE_TOOLS.has(toolName)) {
    const hasRead = [...prior].some((t) => CALENDAR_READ_TOOLS.has(t));
    if (!hasRead) {
      return {
        blocked: true,
        message: `${READ_BEFORE_WRITE_PREFIX} call read_calendar in this turn before ${toolName} so you have the correct event id.`,
      };
    }
  }

  if (LIST_ID_WRITE_TOOLS.has(toolName)) {
    const hasRead = [...prior].some((t) => LIST_READ_TOOLS.has(t));
    if (!hasRead) {
      return {
        blocked: true,
        message: `${READ_BEFORE_WRITE_PREFIX} call list_items or lookup_list_item in this turn before ${toolName} so you have the item id.`,
      };
    }
  }

  return { blocked: false };
}

export function isReadBeforeWriteBlockMessage(output: string): boolean {
  return output.trimStart().startsWith(READ_BEFORE_WRITE_PREFIX);
}
