import { redis } from "../tools/clients.js";

const PREFIX = "magnus:proactive:";

/**
 * Redis SET NX idempotency for proactive delivery (one send per key per TTL).
 */
export async function claimProactiveDelivery(
  key: string,
  ttlSec: number,
): Promise<boolean> {
  const res = await redis.set(`${PREFIX}${key}`, "1", { nx: true, ex: ttlSec });
  return res !== null;
}
