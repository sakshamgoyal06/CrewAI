/**
 * Evening journal confirmation loop — collects fields, confirms, then writes check-in.
 */
import { logDailyCheckin } from "../lists/listService.js";
import { loadDailyLogStatus } from "./dailyLogStatus.js";
import {
  clearEveningJournalPending,
  getEveningJournalPending,
  isEveningJournalConfirmNo,
  isEveningJournalConfirmYes,
  isEveningJournalDecline,
  setEveningJournalPending,
} from "./eveningJournalPending.js";
import { setLoggingDeclined } from "./loggingDeclined.js";
import {
  eveningDraftIsSubstantive,
  formatEveningDraftSummary,
  mergeEveningDraft,
  missingEveningFields,
  parseEveningDraftFromMessage,
} from "./parseEveningDraft.js";
import type { EveningJournalTurnResult } from "./types.js";

export function formatEveningCollectPrompt(missing: string[]): string {
  if (missing.length === 0) {
    return (
      "Evening check-in — share how today went. " +
      "A day rating (1–10), joy score, feeling, or a short reflection all work."
    );
  }
  return `Evening check-in — I still need ${missing.join(" and ")}. Reply in one message when ready.`;
}

export function formatEveningConfirmPrompt(summary: string): string {
  return (
    `Log this evening check-in?\n\n${summary}\n\n` +
    `Reply **yes** to save, **no** to edit, or say you're skipping tonight.`
  );
}

function declineReply(): string {
  return "Got it — no evening check-in tonight. You can log anytime with a quick note.";
}

function loggedReply(summary: string, checkinResult: string): string {
  if (checkinResult.startsWith("Logged daily check-in")) {
    return `Evening check-in saved.\n\n${summary}`;
  }
  return `${checkinResult}\n\n${summary}`;
}

/** Call after the evening_journal proactive message is sent. */
export async function armEveningJournalPendingAfterNudge(
  userProfileId: string,
  dateKey: string,
): Promise<void> {
  const status = await loadDailyLogStatus({ userProfileId, dateKey });
  if (status.hasEveningReflection || status.declinedEvening) {
    return;
  }

  await setEveningJournalPending(userProfileId, {
    phase: "awaiting_engagement",
    dateKey,
    draft: {},
    armedAt: new Date().toISOString(),
  });
}

/** User-initiated evening log from chat (e.g. "log my evening check-in"). */
export async function armEveningJournalPendingFromUser(
  userProfileId: string,
  dateKey: string,
): Promise<void> {
  await setEveningJournalPending(userProfileId, {
    phase: "collecting",
    dateKey,
    draft: {},
    armedAt: new Date().toISOString(),
  });
}

/**
 * Handles the evening journal session until the user confirms a log or explicitly skips.
 */
export async function handleEveningJournalPendingTurn(input: {
  userProfileId: string;
  message: string;
  dateKey: string;
}): Promise<EveningJournalTurnResult> {
  const message = input.message.trim();
  if (!message) {
    return { handled: false };
  }

  const pending = await getEveningJournalPending(input.userProfileId);
  if (!pending || pending.dateKey !== input.dateKey) {
    return { handled: false };
  }

  if (isEveningJournalDecline(message)) {
    await clearEveningJournalPending(input.userProfileId);
    await setLoggingDeclined(input.userProfileId, input.dateKey, "evening");
    return {
      handled: true,
      replyText: declineReply(),
      metadata: {
        evening_journal_pending: false,
        evening_journal_declined: true,
      },
    };
  }

  if (pending.phase === "confirming") {
    const summary = formatEveningDraftSummary(pending.draft);

    if (isEveningJournalConfirmYes(message)) {
      if (!eveningDraftIsSubstantive(pending.draft)) {
        await setEveningJournalPending(input.userProfileId, {
          ...pending,
          phase: "collecting",
        });
        return {
          handled: true,
          replyText: formatEveningCollectPrompt(missingEveningFields(pending.draft)),
          metadata: { evening_journal_pending: true, evening_journal_phase: "collecting" },
        };
      }

      const checkinResult = await logDailyCheckin({
        userProfileId: input.userProfileId,
        date: pending.dateKey,
        day_rating: pending.draft.day_rating,
        joy_score: pending.draft.joy_score,
        feeling: pending.draft.feeling,
        notes: pending.draft.notes,
        append_notes: true,
      });
      await clearEveningJournalPending(input.userProfileId);
      return {
        handled: true,
        replyText: loggedReply(summary, checkinResult),
        metadata: {
          evening_journal_pending: false,
          evening_journal_logged: true,
          evening_journal_draft: pending.draft,
        },
      };
    }

    if (isEveningJournalConfirmNo(message)) {
      await setEveningJournalPending(input.userProfileId, {
        ...pending,
        phase: "collecting",
      });
      return {
        handled: true,
        replyText: formatEveningCollectPrompt(missingEveningFields(pending.draft)),
        metadata: { evening_journal_pending: true, evening_journal_phase: "collecting" },
      };
    }

    const patch = parseEveningDraftFromMessage(message);
    const merged = mergeEveningDraft(pending.draft, patch);
    await setEveningJournalPending(input.userProfileId, {
      ...pending,
      phase: "confirming",
      draft: merged,
    });
    return {
      handled: true,
      replyText: formatEveningConfirmPrompt(formatEveningDraftSummary(merged)),
      metadata: {
        evening_journal_pending: true,
        evening_journal_phase: "confirming",
      },
    };
  }

  // awaiting_engagement or collecting
  const patch = parseEveningDraftFromMessage(message);
  const merged = mergeEveningDraft(pending.draft, patch);

  if (!eveningDraftIsSubstantive(merged)) {
    const missing = missingEveningFields(merged);
    await setEveningJournalPending(input.userProfileId, {
      ...pending,
      phase: "collecting",
      draft: merged,
    });
    return {
      handled: true,
      replyText: formatEveningCollectPrompt(missing),
      metadata: {
        evening_journal_pending: true,
        evening_journal_phase: "collecting",
      },
    };
  }

  await setEveningJournalPending(input.userProfileId, {
    ...pending,
    phase: "confirming",
    draft: merged,
  });
  return {
    handled: true,
    replyText: formatEveningConfirmPrompt(formatEveningDraftSummary(merged)),
    metadata: {
      evening_journal_pending: true,
      evening_journal_phase: "confirming",
    },
  };
}

/** Whether an open evening journal session should intercept this turn. */
export async function hasActiveEveningJournalSession(
  userProfileId: string,
  dateKey: string,
): Promise<boolean> {
  const pending = await getEveningJournalPending(userProfileId);
  return Boolean(pending && pending.dateKey === dateKey);
}
