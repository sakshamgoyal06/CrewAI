/**
 * Push event-log reschedule to linked Google Calendar when google_event_id is set.
 */
import { updateCalendarEvent } from "../agents/tools/calendarTool.js";
import type { EventRow } from "../events/eventTypes.js";
import { logger } from "../logger.js";

export async function syncCalendarAfterEventReschedule(input: {
  userProfileId: string;
  previous: EventRow;
  next: EventRow;
}): Promise<string | null> {
  const googleEventId = input.previous.google_event_id?.trim();
  if (!googleEventId || !input.next.planned_start_at) {
    return null;
  }

  const timeZone = input.next.time_zone || input.previous.time_zone || "UTC";
  const startIso = input.next.planned_start_at;
  const endIso = input.next.planned_end_at ?? undefined;

  try {
    const result = await updateCalendarEvent({
      eventId: googleEventId,
      startIso,
      endIso,
      timeZone,
      userProfileId: input.userProfileId,
    });
    if (result.startsWith("Updated ")) {
      return "Calendar updated to match the new time.";
    }
    if (result.includes("not configured") || result.includes("Could not")) {
      logger.warn({ result, googleEventId }, "calendar sync after reschedule skipped");
      return null;
    }
    return result;
  } catch (err) {
    logger.warn({ err: String(err), googleEventId }, "calendar sync after reschedule failed");
    return null;
  }
}
