/**
 * Activity completion session — parse reply, confirm, write event log + optional calendar sync.
 */
import { rescheduleEvent, updateEvent } from "../events/eventStore.js";
import { describeEvent } from "../events/formatEvents.js";
import { parseReminderTime } from "../proactive/parseReminderTime.js";
import { parseActivityCompletionReply } from "./activityCompletionParser.js";
import {
  clearActivityCompletionPending,
  getActivityCompletionPending,
  isActivityCompletionConfirmNo,
  isActivityCompletionConfirmYes,
  isActivityCompletionDecline,
  setActivityCompletionPending,
  type ActivityCompletionDraft,
  type ActivityCompletionOutcome,
} from "./activityCompletionPending.js";
import { syncCalendarAfterEventReschedule } from "./syncCalendarAfterEventReschedule.js";
export type ActivityCompletionTurnResult =
  | { handled: false }
  | { handled: true; replyText: string; metadata: Record<string, unknown> };

function formatDraftSummary(draft: ActivityCompletionDraft, title: string): string {
  const outcome = draft.outcome ?? "unknown";
  const lines = [`**${title}** → **${outcome}**`];
  if (draft.newStartIso) {
    lines.push(`New time: ${draft.newStartIso}`);
  }
  if (draft.note) {
    lines.push(`Note: ${draft.note}`);
  }
  return lines.join("\n");
}

function formatCollectPrompt(title: string): string {
  return (
    `How did **${title}** go?\n\n` +
    `Reply with done, missed, skip, or when to postpone (e.g. tomorrow 8am).`
  );
}

function formatConfirmPrompt(summary: string): string {
  return `${summary}\n\nReply **yes** to save, **no** to change your answer.`;
}

export async function armActivityCompletionPending(input: {
  userProfileId: string;
  eventId: string;
  eventTitle: string;
  dateKey: string;
  timeZone: string;
  googleEventId?: string | null;
}): Promise<void> {
  await setActivityCompletionPending(input.userProfileId, {
    phase: "awaiting_response",
    eventId: input.eventId,
    eventTitle: input.eventTitle,
    dateKey: input.dateKey,
    timeZone: input.timeZone,
    googleEventId: input.googleEventId ?? null,
    draft: {},
    armedAt: new Date().toISOString(),
  });
}

export async function hasActiveActivityCompletionSession(
  userProfileId: string,
): Promise<boolean> {
  return Boolean(await getActivityCompletionPending(userProfileId));
}

async function applyCompletion(input: {
  userProfileId: string;
  eventId: string;
  timeZone: string;
  draft: ActivityCompletionDraft;
}): Promise<string> {
  const outcome = input.draft.outcome;
  if (!outcome) {
    return "Nothing to save — outcome missing.";
  }

  if (outcome === "postponed") {
    const newStartRaw = input.draft.newStartIso;
    if (!newStartRaw) {
      return "Need a new time to postpone — e.g. tomorrow 8am.";
    }
    const newStartAt = parseReminderTime(newStartRaw, input.timeZone);
    if (!newStartAt) {
      return `Could not read a new time from "${newStartRaw}".`;
    }
    const moved = await rescheduleEvent({
      userProfileId: input.userProfileId,
      eventId: input.eventId,
      newStartAt,
      kind: "postponed",
      reason: input.draft.note ?? "postponed via activity check-in",
      timeZone: input.timeZone,
    });
    if (!moved.ok) {
      return `Could not postpone: ${moved.error}`;
    }
    const calNote = await syncCalendarAfterEventReschedule({
      userProfileId: input.userProfileId,
      previous: moved.data.previous,
      next: moved.data.next,
    });
    const desc = describeEvent(moved.data.next, input.timeZone);
    return `Postponed — ${desc}.${calNote ? ` ${calNote}` : ""}`;
  }

  const status: ActivityCompletionOutcome =
    outcome === "done" ? "done" : outcome === "skipped" ? "skipped" : "missed";

  const updated = await updateEvent({
    userProfileId: input.userProfileId,
    eventId: input.eventId,
    status,
    outcomeNote: input.draft.note,
    reason: input.draft.note,
  });
  if (!updated.ok) {
    return `Could not update event log: ${updated.error}`;
  }
  return `Logged as **${status}**: ${describeEvent(updated.data, input.timeZone)}.`;
}

export async function handleActivityCompletionPendingTurn(input: {
  userProfileId: string;
  message: string;
  timeZone: string;
}): Promise<ActivityCompletionTurnResult> {
  const message = input.message.trim();
  if (!message) {
    return { handled: false };
  }

  const pending = await getActivityCompletionPending(input.userProfileId);
  if (!pending) {
    return { handled: false };
  }

  if (isActivityCompletionDecline(message)) {
    await clearActivityCompletionPending(input.userProfileId);
    return {
      handled: true,
      replyText: "Got it — I'll leave that activity as-is for now.",
      metadata: { activity_completion_pending: false, activity_completion_declined: true },
    };
  }

  if (pending.phase === "confirming") {
    const summary = formatDraftSummary(pending.draft, pending.eventTitle);

    if (isActivityCompletionConfirmYes(message)) {
      const result = await applyCompletion({
        userProfileId: input.userProfileId,
        eventId: pending.eventId,
        timeZone: pending.timeZone || input.timeZone,
        draft: pending.draft,
      });
      await clearActivityCompletionPending(input.userProfileId);
      return {
        handled: true,
        replyText: result,
        metadata: {
          activity_completion_pending: false,
          activity_completion_logged: true,
          activity_completion_outcome: pending.draft.outcome,
        },
      };
    }

    if (isActivityCompletionConfirmNo(message)) {
      await setActivityCompletionPending(input.userProfileId, {
        ...pending,
        phase: "awaiting_response",
        draft: {},
      });
      return {
        handled: true,
        replyText: formatCollectPrompt(pending.eventTitle),
        metadata: { activity_completion_pending: true, activity_completion_phase: "awaiting_response" },
      };
    }

    const reparsed = await parseActivityCompletionReply({
      message,
      eventTitle: pending.eventTitle,
      timeZone: pending.timeZone || input.timeZone,
    });
    if (reparsed.outcome !== "unknown" && reparsed.confidence >= 0.55) {
      const draft: ActivityCompletionDraft = {
        outcome: reparsed.outcome === "decline" ? undefined : reparsed.outcome,
        note: reparsed.note,
        newStartIso: reparsed.new_start_phrase,
      };
      await setActivityCompletionPending(input.userProfileId, {
        ...pending,
        phase: "confirming",
        draft,
      });
      return {
        handled: true,
        replyText: formatConfirmPrompt(formatDraftSummary(draft, pending.eventTitle)),
        metadata: { activity_completion_pending: true, activity_completion_phase: "confirming" },
      };
    }

    return {
      handled: true,
      replyText: formatConfirmPrompt(summary),
      metadata: { activity_completion_pending: true, activity_completion_phase: "confirming" },
    };
  }

  const parsed = await parseActivityCompletionReply({
    message,
    eventTitle: pending.eventTitle,
    timeZone: pending.timeZone || input.timeZone,
  });

  if (parsed.outcome === "decline") {
    await clearActivityCompletionPending(input.userProfileId);
    return {
      handled: true,
      replyText: "Okay — I won't ask about that one again today.",
      metadata: { activity_completion_pending: false, activity_completion_declined: true },
    };
  }

  if (parsed.outcome === "unknown" || parsed.confidence < 0.55) {
    return {
      handled: true,
      replyText: formatCollectPrompt(pending.eventTitle),
      metadata: { activity_completion_pending: true, activity_completion_phase: "awaiting_response" },
    };
  }

  const draft: ActivityCompletionDraft = {
    outcome: parsed.outcome,
    note: parsed.note,
    newStartIso: parsed.new_start_phrase,
  };

  if (parsed.outcome === "postponed" && !draft.newStartIso) {
    return {
      handled: true,
      replyText: `When should I move **${pending.eventTitle}** to? (e.g. tomorrow 8am)`,
      metadata: { activity_completion_pending: true, activity_completion_phase: "awaiting_response" },
    };
  }

  await setActivityCompletionPending(input.userProfileId, {
    ...pending,
    phase: "confirming",
    draft,
  });
  return {
    handled: true,
    replyText: formatConfirmPrompt(formatDraftSummary(draft, pending.eventTitle)),
    metadata: { activity_completion_pending: true, activity_completion_phase: "confirming" },
  };
}
