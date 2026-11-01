/**
 * Keeps `magnus_events` aligned when the calendar changes underneath it.
 * Magnus should not have to remember to update both — these run from the calendar tools.
 */
import { zonedTimeToInstant } from "./eventTime.js";
import { describeEvent } from "./formatEvents.js";
import {
  findOpenByGoogleEventId,
  rescheduleEvent,
  updateEvent,
} from "./eventStore.js";

/** After a calendar delete, cancel the linked open event-log row if one exists. */
export async function syncEventLogAfterCalendarDelete(input: {
  userProfileId: string;
  googleEventId: string;
  timeZone: string;
}): Promise<string | null> {
  const linked = await findOpenByGoogleEventId({
    userProfileId: input.userProfileId,
    googleEventId: input.googleEventId,
  });
  if (!linked.ok || !linked.data) {
    return null;
  }

  const cancelled = await updateEvent({
    userProfileId: input.userProfileId,
    eventId: linked.data.id,
    status: "cancelled",
    reason: "removed from calendar",
  });
  if (!cancelled.ok) {
    return `Event log sync failed: ${cancelled.error}.`;
  }
  return `Event log: cancelled ${describeEvent(cancelled.data, input.timeZone)}.`;
}

/** After a calendar move, reschedule the linked open event-log row to match. */
export async function syncEventLogAfterCalendarUpdate(input: {
  userProfileId: string;
  googleEventId: string;
  newStartIso?: string;
  newEndIso?: string;
  timeZone: string;
}): Promise<string | null> {
  if (!input.newStartIso?.trim()) {
    return null;
  }

  const linked = await findOpenByGoogleEventId({
    userProfileId: input.userProfileId,
    googleEventId: input.googleEventId,
  });
  if (!linked.ok || !linked.data) {
    return null;
  }

  const newStart = zonedTimeToInstant(input.newStartIso.trim(), input.timeZone);
  if (!newStart) {
    return null;
  }
  const newEnd = input.newEndIso?.trim()
    ? zonedTimeToInstant(input.newEndIso.trim(), input.timeZone)
    : null;

  const existingStart = linked.data.planned_start_at
    ? new Date(linked.data.planned_start_at).getTime()
    : null;
  if (existingStart !== null && Math.abs(existingStart - newStart.getTime()) < 60_000) {
    return null;
  }

  const moved = await rescheduleEvent({
    userProfileId: input.userProfileId,
    eventId: linked.data.id,
    newStartAt: newStart,
    newEndAt: newEnd,
    reason: "calendar updated",
    timeZone: input.timeZone,
  });
  if (!moved.ok) {
    return `Event log sync failed: ${moved.error}.`;
  }
  return `Event log: moved to match calendar — now ${describeEvent(moved.data.next, input.timeZone)}.`;
}
