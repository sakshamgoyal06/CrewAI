import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { anthropic, supabase } from "../../tools/clients.js";
import { augmentUserWithMemory } from "../memory/memoryAgent.js";
import type { AgentContext, AgentResult } from "../types.js";
import {
  classifyHealthSubIntent,
  hasFitnessKeyword,
} from "./healthSubIntent.js";
import { HEALTH_SPECIALIST_MODEL } from "./model.js";

/**
 * Fitness specialist — `docs/AGENT_ROSTER.md` §6.3 + LifeOS: supportive tone, no shame;
 * adapt plans to energy/schedule; no medical claims; encourage professional help for injury.
 */
export const FITNESS_SYSTEM = `You are the Fitness specialist for Magnus within LifeOS.

Scope: workouts, training, movement habits, and performance (runs, gym, strength, cardio, steps). Adapt suggestions to the user's stated energy and schedule. Do not diagnose, treat, or make medical claims. If the user mentions injury, sharp pain, or anything that could need clinical care, encourage seeing a qualified professional and keep guidance general and non-alarmist.

LifeOS: supportive tone, no guilt or shame; Joy is a tank to protect, not a score to optimise; offer at most one clear next step unless the user asks for more.

Reply in plain text under 180 words unless the user explicitly asks for detail.`;

function textFromMessage(msg: Message): string {
  for (const block of msg.content) {
    if (block.type === "text") {
      return block.text;
    }
  }
  return "";
}

async function loadWorkoutContext(
  userProfileId: string,
): Promise<{ summary: string; meta: Record<string, unknown> }> {
  const { data, error } = await supabase
    .from("workouts")
    .select("id, type, date")
    .eq("user_profile_id", userProfileId)
    .order("date", { ascending: false })
    .limit(5);

  if (error) {
    return {
      summary: "",
      meta: {
        workout_data: "not_available",
        workout_error: error.message,
      },
    };
  }

  if (!data?.length) {
    return {
      summary: "No recent workout rows found for this profile.",
      meta: { workout_data: "empty" },
    };
  }

  const lines = data.map(
    (row: { id: string; type: string; date: string | null }) =>
      `- ${row.date ?? "?"} — ${row.type} (${row.id.slice(0, 8)}…)`,
  );
  return {
    summary: `Recent workouts (newest first):\n${lines.join("\n")}`,
    meta: { workout_data: "loaded", workout_rows: data.length },
  };
}

/**
 * True when Fitness should own the turn: keyword fast-path, or sub-classifier returns FITNESS.
 * Injected `client` supports tests (mock Anthropic).
 */
export async function shouldAcceptFitnessTurn(
  rawMessage: string,
  client: typeof anthropic = anthropic,
): Promise<boolean> {
  if (hasFitnessKeyword(rawMessage)) {
    return true;
  }
  const sub = await classifyHealthSubIntent(rawMessage, client);
  return sub === "FITNESS";
}

export async function tryFitnessAgent(ctx: AgentContext): Promise<AgentResult | null> {
  const accept = await shouldAcceptFitnessTurn(ctx.rawMessage, anthropic);
  if (!accept) {
    return null;
  }

  const { summary: workoutSummary, meta: workoutMeta } = await loadWorkoutContext(
    ctx.userProfileId,
  );

  const contextBlock = workoutSummary
    ? `\n\nContext for this user:\n${workoutSummary}`
    : "";

  const userContent = augmentUserWithMemory(
    `${ctx.rawMessage}${contextBlock}${ctx.healthPreferences ?? ""}`,
    ctx.memoryBlock,
  );

  const msg = await anthropic.messages.create({
    model: HEALTH_SPECIALIST_MODEL,
    max_tokens: 768,
    system: FITNESS_SYSTEM,
    messages: [
      {
        role: "user",
        content: userContent,
      },
    ],
  });

  const text = textFromMessage(msg).trim() || "…";
  return {
    text,
    metadata: {
      specialist: "Fitness",
      agent: "fitness",
      department: "HEALTH",
      ...workoutMeta,
    },
  };
}
