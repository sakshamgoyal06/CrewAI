/**
 * Self-healing rhythm subscriptions.
 *
 * Seeding used to happen only in `scripts/provision-owner-user.mts`, so a profile created before a
 * rhythm kind existed never received it — the evening journal, drift guard, and weekly rhythm went
 * dark with nothing reporting it. The dispatcher now reconciles missing rows once per local day.
 *
 * Only *missing* rows are inserted. A row the user disabled stays disabled forever.
 */
import { logger } from "../../logger.js";
import { redis } from "../../tools/clients.js";
import { listAllSubscriptions, upsertCatalogSubscription } from "./store.js";
import { RHYTHM_DEFAULT_ENABLED_KINDS } from "./types.js";

const SEED_MARKER_PREFIX = "magnus:proactive:rhythm_seeded:";
const SEED_MARKER_TTL_SEC = 172_800;

export type EnsureRhythmResult = {
  inserted: string[];
  alreadyPresent: number;
};

/**
 * Insert any `RHYTHM_DEFAULT_ENABLED_KINDS` row this user does not have yet.
 *
 * Existing rows are left exactly as they are, enabled or not.
 */
export async function ensureDefaultRhythmSubscriptions(
  userProfileId: string,
): Promise<EnsureRhythmResult> {
  const existing = await listAllSubscriptions(userProfileId);
  const present = new Set(existing.map((s) => s.kind));
  const inserted: string[] = [];

  for (const kind of RHYTHM_DEFAULT_ENABLED_KINDS) {
    if (present.has(kind)) {
      continue;
    }
    const res = await upsertCatalogSubscription({
      userProfileId,
      kind,
      enabled: true,
      source: "system_default",
    });
    if (res.ok) {
      inserted.push(kind);
    } else {
      logger.warn({ userProfileId, kind, error: res.error }, "rhythm subscription seed failed");
    }
  }

  return { inserted, alreadyPresent: present.size };
}

/**
 * Reconcile once per user per local day. The Redis marker keeps the 5-minute dispatcher tick from
 * re-querying subscriptions for every user on every run.
 */
export async function ensureDefaultRhythmSubscriptionsOncePerDay(
  userProfileId: string,
  dateKey: string,
): Promise<EnsureRhythmResult | null> {
  const key = `${SEED_MARKER_PREFIX}${userProfileId}:${dateKey}`;
  const claimed = await redis.set(key, "1", { nx: true, ex: SEED_MARKER_TTL_SEC });
  if (!claimed) {
    return null;
  }

  const result = await ensureDefaultRhythmSubscriptions(userProfileId);
  if (result.inserted.length > 0) {
    logger.info(
      { userProfileId, inserted: result.inserted },
      "seeded missing rhythm proactive subscriptions",
    );
  }
  return result;
}
