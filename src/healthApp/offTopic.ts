/**
 * Off-topic brake (OWASP LLM10 unbounded consumption, LLM01 prompt injection). The coach calls
 * `decline_off_topic` when it turns down a non-health ask; each call is counted per person and
 * local day. After `MAGNUS_OFF_TOPIC_LIMIT` declines (default 5), messages with no health words
 * get a fixed reply with no model call for the rest of the day, so a person probing for a way out
 * of scope stops costing anything. Messages about food, training, body or sleep still reach the
 * coach. Set the limit to 0 to turn the brake off.
 */
import { logger } from "../logger.js";
import { supabase } from "../tools/clients.js";
import { loggableError } from "../util/loggableError.js";

export const OFF_TOPIC_REPLY = "I only help with your health: food, training, steps, sleep and your goal. Tell me what you ate or did today and I'll log it.";

export const OFF_TOPIC_BRAKE_REPLY =
  "I'm sticking to your health today, so I won't answer other questions. Log a meal, steps, a workout or a weigh-in and I'm right here.";

/** Words that make a message worth the coach's time even when the brake is on. */
const HEALTH_SIGNAL =
  /\b(ate|had|eat|eating|food|meal|breakfast|lunch|dinner|snack|protein|carb|fat|fibre|fiber|calorie|kcal|diet|roti|rice|dal|chai|coffee|water|drank|piya|khaya|khaana|khana|walk(ed|ing)?|ran|running|swam|swim|cycle|cycled|gym|workout|exercise|train(ing)?|lift(ed)?|yoga|sport|cricket|football|badminton|steps?|weigh(ed|t)?|kg|body ?fat|muscle|sleep|slept|tired|stress|sore|pain|injur\w*|hevy|routine|recipe|supplement|creatine|vitamin|hungry|craving|health)\b/i;

export function looksHealthRelated(text: string): boolean {
  return HEALTH_SIGNAL.test(text);
}

export function offTopicLimit(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.MAGNUS_OFF_TOPIC_LIMIT?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 5;
  return Number.isFinite(n) && n >= 0 ? n : 5;
}

const declines = new Map<string, { day: string; count: number }>();

export function countDecline(userProfileId: string, day: string): number {
  const cur = declines.get(userProfileId);
  const count = (cur?.day === day ? cur.count : 0) + 1;
  declines.set(userProfileId, { day, count });
  if (declines.size > 20_000) for (const [k, v] of declines) if (v.day !== day) declines.delete(k);
  return count;
}

export function declinesToday(userProfileId: string, day: string): number {
  const cur = declines.get(userProfileId);
  return cur?.day === day ? cur.count : 0;
}

/** Starts the day from the off_topic events already logged (never lowers a live count). */
export function seedDeclines(userProfileId: string, day: string, count: number): void {
  const cur = declines.get(userProfileId);
  declines.set(userProfileId, { day, count: Math.max(cur?.day === day ? cur.count : 0, count) });
}

export function needsDeclineSeed(userProfileId: string, day: string): boolean {
  return declines.get(userProfileId)?.day !== day;
}

/** True when this message should get the fixed reply instead of a model call. */
export function brakeOn(userProfileId: string, day: string, text: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const limit = offTopicLimit(env);
  return limit > 0 && declinesToday(userProfileId, day) >= limit && !looksHealthRelated(text);
}

/** Today's declines from the event log, so a redeploy doesn't lift the brake. */
export async function declinesSince(userProfileId: string, fromIso: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from("health_app_events")
      .select("id", { count: "exact", head: true })
      .eq("user_profile_id", userProfileId)
      .eq("kind", "off_topic")
      .gte("occurred_at", fromIso);
    if (error) throw new Error(error.message);
    return count ?? 0;
  } catch (err) {
    logger.warn({ err: loggableError(err) }, "off-topic seed read failed");
    return 0;
  }
}

export function _resetDeclines(): void {
  declines.clear();
}
