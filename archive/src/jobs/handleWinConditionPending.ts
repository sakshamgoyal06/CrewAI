import { logDailyCheckin } from "../lists/listService.js";
import { isMorningBriefTrigger } from "../proactive/morningBriefManual.js";
import {
  clearWinConditionPending,
  formatWinConditionCollectPrompt,
  formatWinConditionConfirmPrompt,
  getWinConditionPending,
  isWinConditionConfirmNo,
  isWinConditionConfirmYes,
  isWinConditionDecline,
  setWinConditionPending,
} from "./winConditionPending.js";

export type WinConditionTurnResult =
  | { handled: false }
  | { handled: true; replyText: string; metadata: Record<string, unknown> };

function declineReply(): string {
  return "Got it — I won't log a win condition for today.";
}

function loggedReply(candidateText: string, checkinResult: string): string {
  if (checkinResult.startsWith("Check-in") || checkinResult.includes("saved")) {
    return `Today's win is locked in: **${candidateText.trim()}**`;
  }
  return `${checkinResult}\n\nWin condition: **${candidateText.trim()}**`;
}

/**
 * Handles the post–Morning Brief win-condition confirmation loop until the user
 * confirms a log or explicitly skips.
 */
export async function handleWinConditionPendingTurn(input: {
  userProfileId: string;
  message: string;
}): Promise<WinConditionTurnResult> {
  const message = input.message.trim();
  if (!message || isMorningBriefTrigger(message)) {
    return { handled: false };
  }

  const pending = await getWinConditionPending(input.userProfileId);
  if (!pending) {
    return { handled: false };
  }

  if (isWinConditionDecline(message)) {
    await clearWinConditionPending(input.userProfileId);
    return {
      handled: true,
      replyText: declineReply(),
      metadata: { win_condition_pending: false, win_condition_declined: true },
    };
  }

  if (pending.phase === "confirming") {
    const candidate = pending.candidateText?.trim() ?? "";

    if (isWinConditionConfirmYes(message)) {
      if (!candidate) {
        await setWinConditionPending(input.userProfileId, { phase: "collecting" });
        return {
          handled: true,
          replyText: formatWinConditionCollectPrompt(),
          metadata: { win_condition_pending: true, win_condition_phase: "collecting" },
        };
      }

      const checkinResult = await logDailyCheckin({
        userProfileId: input.userProfileId,
        morning_intention: candidate,
      });
      await clearWinConditionPending(input.userProfileId);
      return {
        handled: true,
        replyText: loggedReply(candidate, checkinResult),
        metadata: {
          win_condition_pending: false,
          win_condition_logged: true,
          morning_intention: candidate,
        },
      };
    }

    if (isWinConditionConfirmNo(message)) {
      await setWinConditionPending(input.userProfileId, { phase: "collecting" });
      return {
        handled: true,
        replyText: formatWinConditionCollectPrompt(),
        metadata: { win_condition_pending: true, win_condition_phase: "collecting" },
      };
    }

    const nextCandidate = message.trim();
    await setWinConditionPending(input.userProfileId, {
      phase: "confirming",
      candidateText: nextCandidate,
    });
    return {
      handled: true,
      replyText: formatWinConditionConfirmPrompt(nextCandidate),
      metadata: {
        win_condition_pending: true,
        win_condition_phase: "confirming",
        win_condition_candidate: nextCandidate,
      },
    };
  }

  // collecting — treat this message as the proposed win condition.
  if (isWinConditionConfirmYes(message) || isWinConditionConfirmNo(message)) {
    return {
      handled: true,
      replyText: formatWinConditionCollectPrompt(),
      metadata: { win_condition_pending: true, win_condition_phase: "collecting" },
    };
  }

  await setWinConditionPending(input.userProfileId, {
    phase: "confirming",
    candidateText: message,
  });
  return {
    handled: true,
    replyText: formatWinConditionConfirmPrompt(message),
    metadata: {
      win_condition_pending: true,
      win_condition_phase: "confirming",
      win_condition_candidate: message,
    },
  };
}

/** Call after Morning Brief when the intention question was included. */
export async function armWinConditionPendingAfterBrief(userProfileId: string): Promise<void> {
  await setWinConditionPending(userProfileId, { phase: "collecting" });
}
