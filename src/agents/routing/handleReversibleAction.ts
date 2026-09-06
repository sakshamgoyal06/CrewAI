/**
 * Orchestrator prelude: undo last reversible write without disambiguation.
 */
import { softDeleteMealSession } from "../../nutrition/store/mealHistoryStore.js";
import { isMinimalMode, parkedFeatureReply } from "../../config/minimalMode.js";
import {
  clearReversibleAction,
  getReversibleAction,
  isUndoRequest,
  type ReversibleAction,
} from "./reversibleAction.js";

export type ReversibleActionTurnResult =
  | { handled: false }
  | { handled: true; replyText: string; metadata: Record<string, unknown> };

async function executeUndo(
  userProfileId: string,
  action: ReversibleAction,
  timezone?: string | null,
): Promise<ReversibleActionTurnResult> {
  switch (action.kind) {
    case "meal_undo": {
      if (isMinimalMode()) {
        await clearReversibleAction(userProfileId);
        return {
          handled: true,
          replyText: parkedFeatureReply("Meals & nutrition"),
          metadata: {
            parked: "meals",
            pillar_compose: false,
            magnus_voice_finalized: true,
          },
        };
      }
      const sessionId = action.payload.meal_session_id;
      if (typeof sessionId !== "string" || !sessionId.trim()) {
        await clearReversibleAction(userProfileId);
        return { handled: false };
      }
      const result = await softDeleteMealSession(userProfileId, sessionId, timezone);
      await clearReversibleAction(userProfileId);
      if (!result.ok) {
        return {
          handled: true,
          replyText: `I couldn't undo that meal log — ${result.error}.`,
          metadata: {
            reversible_action_undo: false,
            pillar_compose: false,
            magnus_voice_finalized: true,
          },
        };
      }
      return {
        handled: true,
        replyText: `Undone — removed **${action.summary}** from your meal log.`,
        metadata: {
          reversible_action_undo: true,
          meal_session_id: sessionId,
          pillar_compose: false,
          magnus_voice_finalized: true,
        },
      };
    }
    default:
      await clearReversibleAction(userProfileId);
      return { handled: false };
  }
}

export async function handleReversibleActionTurn(input: {
  userProfileId: string;
  message: string;
  timezone?: string | null;
}): Promise<ReversibleActionTurnResult> {
  if (!isUndoRequest(input.message)) {
    return { handled: false };
  }

  const action = await getReversibleAction(input.userProfileId);
  if (!action) {
    return {
      handled: true,
      replyText:
        "I don't have a recent action to undo. Tell me what to reverse — meal log, list item, or calendar change.",
      metadata: {
        reversible_action_undo: false,
        undo_no_pending: true,
        pillar_compose: false,
        magnus_voice_finalized: true,
      },
    };
  }

  return executeUndo(input.userProfileId, action, input.timezone);
}
