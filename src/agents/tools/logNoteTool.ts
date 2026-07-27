/**
 * Journaling and logging as a Magnus tool: Supabase is the durable store, Notion the
 * human-readable surface when it is configured.
 *
 * Supabase failure is reported; Notion failure is not fatal, because losing the pretty copy is
 * not the same as losing the note.
 */
import { logger } from "../../logger.js";
import { loggableError } from "../../util/loggableError.js";
import { recordMagnusDailyLog } from "../../tools/dailyLog.js";
import {
  appendParagraphBlocks,
  createNotionClient,
  ensurePageForDate,
  formatDateKeyInTimeZone,
  getNotionToken,
  notionDailyLogParentPageId,
  notionLogTitlePrefix,
  notionPageTitlePropertyName,
} from "../../tools/notion.js";

async function mirrorToNotion(
  when: Date,
  timeZone: string,
  text: string,
): Promise<string | null> {
  const parentPageId = notionDailyLogParentPageId();
  if (!getNotionToken() || !parentPageId) {
    return null;
  }
  const client = createNotionClient();
  if (!client) {
    return null;
  }
  try {
    const page = await ensurePageForDate(
      client,
      parentPageId,
      when,
      timeZone,
      notionLogTitlePrefix(),
      notionPageTitlePropertyName(),
    );
    await appendParagraphBlocks(client, page.pageId, [text]);
    return page.pageId;
  } catch (e) {
    logger.warn({ err: loggableError(e) }, "notion daily log mirror failed");
    return null;
  }
}

export async function logNote(input: {
  userProfileId: string;
  text: string;
  date?: string;
  timeZone: string;
}): Promise<string> {
  const text = input.text.trim();
  if (!text) {
    return "Nothing to log — the note was empty.";
  }

  const explicitDate =
    input.date?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(input.date.trim())
      ? input.date.trim()
      : undefined;
  const when = explicitDate ? new Date(`${explicitDate}T12:00:00Z`) : new Date();
  const dateKey = explicitDate ?? formatDateKeyInTimeZone(when, input.timeZone);

  const notionPageId = await mirrorToNotion(when, input.timeZone, text);

  const saved = await recordMagnusDailyLog({
    userProfileId: input.userProfileId,
    logDate: dateKey,
    body: text,
    source: "telegram",
    notionPageId,
    metadata: { logged_by: "magnus" },
  });

  if (!saved.ok) {
    return `Could not save the note: ${saved.error ?? "unknown error"}.`;
  }
  return notionPageId
    ? `Logged for ${dateKey} (saved and mirrored to Notion).`
    : `Logged for ${dateKey}.`;
}
