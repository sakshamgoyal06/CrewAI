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
  formatReconcileSummary,
  reconcileEventCompletionsFromText,
} from "../../events/eventCompletionReconcile.js";
import { updateEvent } from "../../events/eventStore.js";
import {
  appendParagraphBlocks,
  ensurePageForDate,
  formatDateKeyInTimeZone,
  notionLogTitlePrefix,
  notionPageTitlePropertyName,
} from "../../tools/notion.js";
import { createNotionClientForUser } from "../../tools/notionUser.js";

async function mirrorToNotion(
  userProfileId: string,
  when: Date,
  timeZone: string,
  text: string,
): Promise<string | null> {
  const notion = await createNotionClientForUser(userProfileId);
  const parentPageId = notion?.config.dailyLogParentPageId;
  if (!notion?.client || !parentPageId) {
    return null;
  }
  try {
    const page = await ensurePageForDate(
      notion.client,
      parentPageId,
      when,
      timeZone,
      notionLogTitlePrefix(),
      notionPageTitlePropertyName(),
    );
    await appendParagraphBlocks(notion.client, page.pageId, [text]);
    return page.pageId;
  } catch (e) {
    logger.warn({ err: loggableError(e) }, "notion daily log mirror failed");
    return null;
  }
}

/**
 * Attaches a saved note to the commitment it is about, so "skipped the gym, back was sore" is
 * reachable from the event as well as from the journal.
 */
async function linkToEvent(input: {
  userProfileId: string;
  eventId: string;
  dailyLogId: string;
}): Promise<string | null> {
  const linked = await updateEvent({
    userProfileId: input.userProfileId,
    eventId: input.eventId,
    dailyLogId: input.dailyLogId,
  });
  if (!linked.ok) {
    logger.warn({ err: linked.error }, "daily log event link failed");
    return null;
  }
  return linked.data.title;
}

export async function logNote(input: {
  userProfileId: string;
  text: string;
  date?: string;
  timeZone: string;
  /** When the note is about a specific commitment from the event log. */
  eventId?: string;
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

  const notionPageId = await mirrorToNotion(input.userProfileId, when, input.timeZone, text);

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

  if (saved.id) {
    const { indexJournalEmbedding } = await import("../memory/memoryEmbeddings.js");
    void indexJournalEmbedding({
      userProfileId: input.userProfileId,
      dailyLogId: saved.id,
      body: text,
    }).catch(() => {});
  }

  let linkedTitle: string | null = null;
  if (input.eventId?.trim() && saved.id) {
    linkedTitle = await linkToEvent({
      userProfileId: input.userProfileId,
      eventId: input.eventId.trim(),
      dailyLogId: saved.id,
    });
  }

  const reconcile = await reconcileEventCompletionsFromText({
    userProfileId: input.userProfileId,
    text,
    timeZone: input.timeZone,
    completedAt: explicitDate ? when : undefined,
  });
  const reconcileSummary = formatReconcileSummary(reconcile);

  const where = notionPageId ? " (saved and mirrored to Notion)" : "";
  const attached = linkedTitle ? ` Attached to "${linkedTitle}".` : "";
  const reconciled = reconcileSummary ? ` ${reconcileSummary}` : "";
  return `Logged for ${dateKey}${where}.${attached}${reconciled}`;
}
