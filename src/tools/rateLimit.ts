import { rateLimitPerMinute } from "../env.js";
import { logger } from "../logger.js";
import { redis } from "./clients.js";

/**
 * Fixed window: count messages per Telegram user per 60s bucket (Redis).
 * Returns not ok when count exceeds MAGNUS_RATE_LIMIT_PER_MINUTE (0 = disabled).
 */
export async function checkMessageRateLimit(
  telegramUserId: string,
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const limit = rateLimitPerMinute();
  if (limit === 0) {
    return { ok: true };
  }

  const key = `magnus:ratelimit:telegram:${telegramUserId}`;

  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 60);
    }
    if (count > limit) {
      const ttl = await redis.ttl(key);
      return { ok: false, retryAfterSec: ttl > 0 ? ttl : 60 };
    }
    return { ok: true };
  } catch (e) {
    logger.error({ err: e instanceof Error ? e.message : e }, "rate limit redis error; allowing message");
    return { ok: true };
  }
}
