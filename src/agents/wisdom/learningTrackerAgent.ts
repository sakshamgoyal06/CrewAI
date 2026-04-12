import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import type { Intent } from "../../intent.js";
import { anthropic, supabase } from "../../tools/clients.js";
import { augmentUserWithMemory } from "../memory/memoryAgent.js";
import { SPECIALIST_USER_IDENTITY } from "../promptIdentity.js";
import type { AgentContext, AgentResult, DepartmentAgent } from "../types.js";

const MODEL = "claude-sonnet-4-6";

const GOAL_ROW_LIMIT = 8;
const LOG_ROW_LIMIT = 12;

/**
 * Weekly learning reviews, habit nudges, and lightweight progress framing — Wisdom pillar.
 * When `learning_goals` / `learning_logs` exist and are readable, optional rows are appended; otherwise text-only.
 */
/** Slash `/track` sets `ctx.department === "tracking_habits"`; natural language uses heuristics. */
export function shouldRouteToLearningTracker(
  intent: Intent,
  ctx?: AgentContext,
): boolean {
  if (intent !== "LEARNING") {
    return false;
  }
  if (ctx?.department === "tracking_habits") {
    return true;
  }
  return isLearningTrackerMessage(ctx?.rawMessage ?? "");
}

export function isLearningTrackerMessage(rawMessage: string): boolean {
  const t = rawMessage.toLowerCase();
  return (
    /\b(weekly|review|habit|streak|reflection|check[- ]?in|how am i doing|adjust my|learning log|review my week)\b/.test(
      t,
    ) || /\b(learning\s+review|weekly\s+learning)\b/.test(t)
  );
}

export const LEARNING_TRACKER_SYSTEM = `You are the Learning Tracker specialist for Magnus within LifeOS (Wisdom pillar).

${SPECIALIST_USER_IDENTITY}

Scope: Help the user with **weekly learning reviews**, **small habit adjustments**, and **lightweight progress framing** — what moved forward, what felt stuck, and one concrete next step. You are a coach for **sustainable learning practice**, not a tutor who explains subject matter in depth (unless they clearly want a brief clarification).

**Format:** Prefer short sections: **This week**, **Habits / rhythm**, **One tweak**, **Next step** — or similar. Keep it skimmable.

**Limits:** You do not browse the live web. Optional read-only rows from Magnus may be appended; use them when present and do not invent database facts. If no DB context is provided, work from the user's message and memory block only.

Optional context may include north star and timezone. Use them when present.

Keep replies under ~320 words unless they ask for more. Warm, direct, no guilt.`;

function textFromMessage(msg: Message): string {
  for (const block of msg.content) {
    if (block.type === "text") {
      return block.text;
    }
  }
  return "";
}

function optionalProfileBlock(ctx: AgentContext): string {
  const parts: string[] = [];
  if (ctx.northStarGoal?.trim()) {
    parts.push(`North star (from profile): ${ctx.northStarGoal.trim()}`);
  }
  if (ctx.timezone?.trim()) {
    parts.push(`Timezone (from profile): ${ctx.timezone.trim()}`);
  }
  if (parts.length === 0) {
    return "";
  }
  return `\n\n${parts.join("\n")}`;
}

/**
 * Best-effort read-only rows from `learning_goals` and `learning_logs` when tables exist and queries succeed.
 */
export async function optionalLearningDbBlock(userProfileId: string): Promise<string> {
  try {
    const { data: goals, error: goalsError } = await supabase
      .from("learning_goals")
      .select("*")
      .eq("user_profile_id", userProfileId)
      .order("updated_at", { ascending: false })
      .limit(GOAL_ROW_LIMIT);

    if (goalsError || !goals?.length) {
      return "";
    }

    const goalLines = goals.map((row, i) => `Goal ${i + 1}: ${JSON.stringify(row)}`);
    const goalIds = goals
      .map((g: { id?: string }) => g.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    let logLines: string[] = [];
    if (goalIds.length > 0) {
      const { data: logs, error: logsError } = await supabase
        .from("learning_logs")
        .select("*")
        .in("learning_goal_id", goalIds)
        .limit(LOG_ROW_LIMIT);

      if (!logsError && logs?.length) {
        logLines = logs.map((row, i) => `Log ${i + 1}: ${JSON.stringify(row)}`);
      }
    }

    const parts = [
      `\n\nOptional read-only context (learning_goals, up to ${GOAL_ROW_LIMIT} rows; may be incomplete):`,
      ...goalLines,
    ];
    if (logLines.length > 0) {
      parts.push(
        `\nOptional read-only context (learning_logs, up to ${LOG_ROW_LIMIT} rows; may be incomplete):`,
        ...logLines,
      );
    }
    return parts.join("\n");
  } catch {
    return "";
  }
}

export type LearningTrackerDeps = {
  learningDbBlock?: typeof optionalLearningDbBlock;
};

export async function runLearningTrackerAgent(
  ctx: AgentContext,
  deps: LearningTrackerDeps = {},
): Promise<AgentResult> {
  const loadDb = deps.learningDbBlock ?? optionalLearningDbBlock;
  const profileBlock = optionalProfileBlock(ctx);
  const dbBlock = await loadDb(ctx.userProfileId);
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 896,
    system: LEARNING_TRACKER_SYSTEM,
    messages: [
      {
        role: "user",
        content: augmentUserWithMemory(
          `${ctx.rawMessage}${profileBlock}${dbBlock}`,
          ctx.memoryBlock,
        ),
      },
    ],
  });
  const text = textFromMessage(msg).trim() || "…";
  return {
    text,
    metadata: {
      specialist: "LearningTracker",
      department: "tracker",
      pillar: "wisdom",
    },
  };
}

export const learningTrackerAgent: DepartmentAgent = {
  name: "LearningTracker",
  handles: (intent, ctx) => shouldRouteToLearningTracker(intent, ctx),
  run: runLearningTrackerAgent,
};
