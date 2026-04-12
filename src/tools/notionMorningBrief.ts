/**
 * Optional Notion surface for Morning Brief (create child page under a parent).
 * Requires `NOTION_TOKEN` and `NOTION_MORNING_BRIEF_PARENT_PAGE_ID`.
 */
import { logger } from "../logger.js";

const NOTION_VERSION = "2022-06-28";

function splitBodyToBlocks(body: string): Array<{ object: "block"; type: "paragraph"; paragraph: { rich_text: Array<{ type: "text"; text: { content: string } }> } }> {
  const parts = body.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  const max = 1800;
  for (const p of parts) {
    if (p.length <= max) {
      chunks.push(p);
      continue;
    }
    for (let i = 0; i < p.length; i += max) {
      chunks.push(p.slice(i, i + max));
    }
  }
  return chunks.slice(0, 90).map((text) => ({
    object: "block" as const,
    type: "paragraph" as const,
    paragraph: {
      rich_text: [{ type: "text" as const, text: { content: text } }],
    },
  }));
}

/**
 * Creates a subpage under the configured parent. Returns page id or null if skipped / failed.
 */
export async function createMorningBriefNotionPage(input: {
  title: string;
  body: string;
}): Promise<string | null> {
  const token = process.env.NOTION_TOKEN?.trim();
  const parentPage = process.env.NOTION_MORNING_BRIEF_PARENT_PAGE_ID?.trim();
  if (!token || !parentPage) {
    return null;
  }

  const titleKey = process.env.NOTION_MORNING_BRIEF_TITLE_PROPERTY?.trim() || "title";

  const children = splitBodyToBlocks(input.body);

  const bodyPayload = {
    parent: { page_id: parentPage },
    properties: {
      [titleKey]: {
        title: [{ type: "text", text: { content: input.title } }],
      },
    },
    children,
  };

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(bodyPayload),
  });

  if (!res.ok) {
    const errText = await res.text();
    logger.warn({ status: res.status, errText }, "Notion morning brief page create failed");
    return null;
  }

  const json = (await res.json()) as { id?: string };
  return json.id ?? null;
}
