/**
 * Resolve active project session before pillar routing (lock / cancel work from any intent).
 */
import type { AgentContext, AgentResult } from "../agents/types.js";
import {
  parseProjectSetupTurn,
  projectSetupIntentActionable,
} from "./parseProjectSetupTurn.js";
import { runProjectSetupFlow } from "./projectSetupFlow.js";
import { abandonProjectSession, getActiveProjectSession } from "./projectSessionStore.js";

export type ProjectSessionPreludeResult =
  | { handled: true; result: AgentResult }
  | { handled: false; sessionAbandoned?: boolean };

export async function tryResolveActiveProjectSessionTurn(
  ctx: AgentContext,
): Promise<ProjectSessionPreludeResult> {
  const session = await getActiveProjectSession(ctx.userProfileId);
  if (!session) {
    return { handled: false };
  }

  const parsed = await parseProjectSetupTurn({
    message: ctx.rawMessage,
    session,
  });

  if (
    parsed.intent === "cancel_setup" &&
    projectSetupIntentActionable(parsed)
  ) {
    await abandonProjectSession(session.id);
    return { handled: false, sessionAbandoned: true };
  }

  if (parsed.intent === "lock" && projectSetupIntentActionable(parsed)) {
    return {
      handled: true,
      result: await runProjectSetupFlow(ctx, parsed),
    };
  }

  return { handled: false };
}
