import type Anthropic from "@anthropic-ai/sdk";

import type { HealthSubIntent } from "../types.js";

/** Fast path: exercise / training language → Fitness may handle without a classifier-only path for acceptance. */
const FITNESS_KEYWORD_RE =
  /\b(workouts?|work\s*out|exercises?|gym|gyms|steps?|lift(ing)?|weights?|barbell|dumbbell|cardio|training|train(ed|ing)?|reps?|\bpr\b|pb\b|personal\s+record|marathon|5k|10k|jog(ging)?|squats?|deadlifts?|bench(press)?|\bsets?\b|hiit|crossfit|mobility|stretch(ing)?|rowing|cycl(e|ing)|swim(ming)?|hik(e|ing)|bodybuilding|athlete|warm-?up|cool-?down|hypertrophy|strength|treadmill|pliometrics?|muscle|muscles)\b/i;

const HEALTH_SUBCLASS_MODEL = "claude-sonnet-4-6";

const CLASSIFY_SYSTEM = `You are a strict classifier for health-related user messages.
Reply with exactly one token from this set, uppercase, no other words or punctuation:
FITNESS | NUTRITION | ENERGY | OTHER

Definitions:
- FITNESS: exercise, training, running, gym, strength, cardio, steps, sport, workouts, PRs.
- NUTRITION: meals, food, macros, diet, calories, eating, hydration as food, supplements as diet.
- ENERGY: sleep, fatigue, tiredness, HRV, recovery, stress, burnout, focus when not about exercise.
- OTHER: general health chat that does not clearly fit the three buckets.`;

export function hasFitnessKeyword(message: string): boolean {
  return FITNESS_KEYWORD_RE.test(message);
}

export function parseHealthSubIntentLabel(raw: string): HealthSubIntent {
  const upper = raw.trim().toUpperCase();
  if (/\bFITNESS\b/.test(upper)) {
    return "FITNESS";
  }
  if (/\bNUTRITION\b/.test(upper)) {
    return "NUTRITION";
  }
  if (/\bENERGY\b/.test(upper)) {
    return "ENERGY";
  }
  if (/\bOTHER\b/.test(upper)) {
    return "OTHER";
  }
  return "OTHER";
}

function textFromAssistantMessage(msg: {
  content: Array<{ type: string; text?: string }>;
}): string {
  for (const block of msg.content) {
    if (block.type === "text" && block.text) {
      return block.text;
    }
  }
  return "";
}

/**
 * Second-stage classifier when keyword routing is inconclusive. Max 64 tokens; strict label.
 */
export async function classifyHealthSubIntent(
  userMessage: string,
  anthropic: Anthropic,
): Promise<HealthSubIntent> {
  const msg = await anthropic.messages.create({
    model: HEALTH_SUBCLASS_MODEL,
    max_tokens: 64,
    system: CLASSIFY_SYSTEM,
    messages: [{ role: "user", content: userMessage }],
  });
  return parseHealthSubIntentLabel(textFromAssistantMessage(msg));
}
