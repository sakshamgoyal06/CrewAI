/**
 * What each person's coach chat costs in model spend today, and two caps on it (OWASP LLM10,
 * unbounded consumption). The turn caps in usageLimits.ts count messages; a long Sonnet turn
 * costs ~50x a short Haiku one, so they don't bound the bill on their own.
 *
 * - Soft cap (`MAGNUS_DAILY_SPEND_SOFT_USD`, default $1): past it, the rest of the day's turns run
 *   on the fast model only, with no escalation to the main one. Logging and coaching still work.
 * - Hard cap (`MAGNUS_DAILY_SPEND_HARD_USD`, default $3): past it, chat stops until tomorrow.
 *
 * Counted in memory per person and local day; the first turn of a day starts from the day's
 * chat_turn rows, so a redeploy doesn't reset anyone. Set a cap to 0 to turn it off.
 */
import { logger } from "../logger.js";
import { supabase } from "../tools/clients.js";
import { loggableError } from "../util/loggableError.js";

/** USD per million tokens. Cache writes are 1.25x input (5-minute TTL), reads 0.1x. */
type Price = { input: number; output: number };
const PRICES: Array<[RegExp, Price]> = [
  [/^claude-haiku-5/, { input: 0.1, output: 0.5 }],
  [/^claude-haiku-4/, { input: 1, output: 5 }],
  [/^claude-sonnet-5/, { input: 2, output: 10 }],
  [/^claude-sonnet-4/, { input: 3, output: 15 }],
  [/^claude-opus-5-5/, { input: 4, output: 20 }],
  [/^claude-opus/, { input: 5, output: 25 }],
];
/** Unknown model: price it as the dearest Sonnet so a cap is never too loose. */
const FALLBACK: Price = { input: 3, output: 15 };

export function priceOf(model: string): Price {
  return PRICES.find(([re]) => re.test(model))?.[1] ?? FALLBACK;
}

export type TurnTokens = { input: number; output: number; cacheRead: number; cacheWrite: number };

/**
 * Cost of one turn in USD. A turn can switch models (fast, then main); its tokens are summed, so
 * they are priced at the dearest model it used.
 */
export function turnCostUsd(models: string[], tokens: Partial<TurnTokens> | null | undefined): number {
  if (!tokens || !models.length) return 0;
  const p = models.map(priceOf).reduce((a, b) => (b.output > a.output ? b : a));
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
  return (n(tokens.input) * p.input + n(tokens.output) * p.output + n(tokens.cacheRead) * p.input * 0.1 + n(tokens.cacheWrite) * p.input * 1.25) / 1_000_000;
}

const capOf = (name: string, fallback: number, env: NodeJS.ProcessEnv): number => {
  const raw = env[name]?.trim();
  const n = raw ? Number.parseFloat(raw) : fallback;
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export function spendCaps(env: NodeJS.ProcessEnv = process.env): { soft: number; hard: number } {
  return { soft: capOf("MAGNUS_DAILY_SPEND_SOFT_USD", 1, env), hard: capOf("MAGNUS_DAILY_SPEND_HARD_USD", 3, env) };
}

export type SpendMode = "ok" | "fast_only" | "blocked";

const spent = new Map<string, { day: string; usd: number }>();

/** Today's mode for this person: full coach, fast model only, or stopped. */
export function spendMode(userProfileId: string, day: string, env: NodeJS.ProcessEnv = process.env): SpendMode {
  const usd = spent.get(userProfileId)?.day === day ? spent.get(userProfileId)!.usd : 0;
  const { soft, hard } = spendCaps(env);
  if (hard > 0 && usd >= hard) return "blocked";
  if (soft > 0 && usd >= soft) return "fast_only";
  return "ok";
}

export function needsSpendSeed(userProfileId: string, day: string): boolean {
  return spent.get(userProfileId)?.day !== day;
}

/** Starts the day from what is already spent (never lowers a live total). */
export function seedSpend(userProfileId: string, day: string, usd: number): void {
  const cur = spent.get(userProfileId);
  const base = cur?.day === day ? cur.usd : 0;
  spent.set(userProfileId, { day, usd: Math.max(base, usd) });
  if (spent.size > 20_000) for (const [k, v] of spent) if (v.day !== day) spent.delete(k);
}

export function addSpend(userProfileId: string, day: string, usd: number): void {
  if (!(usd > 0)) return;
  const cur = spent.get(userProfileId);
  spent.set(userProfileId, { day, usd: (cur?.day === day ? cur.usd : 0) + usd });
}

export function spentToday(userProfileId: string, day: string): number {
  const cur = spent.get(userProfileId);
  return cur?.day === day ? cur.usd : 0;
}

/** Sum of today's chat_turn costs from the event log. A failed read starts from zero. */
export async function spentSince(userProfileId: string, fromIso: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("health_app_events")
      .select("props")
      .eq("user_profile_id", userProfileId)
      .eq("kind", "chat_turn")
      .gte("occurred_at", fromIso)
      .limit(2000);
    if (error) throw new Error(error.message);
    return (data ?? []).reduce((sum, row) => {
      const p = (row as { props?: { models?: unknown; tokens?: Partial<TurnTokens> } }).props;
      const models = Array.isArray(p?.models) ? p!.models.filter((m): m is string => typeof m === "string") : [];
      return sum + turnCostUsd(models, p?.tokens);
    }, 0);
  } catch (err) {
    logger.warn({ err: loggableError(err) }, "spend seed read failed");
    return 0;
  }
}

export function _resetSpend(): void {
  spent.clear();
}
