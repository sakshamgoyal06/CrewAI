/**
 * Paused accounts. A person who keeps steering the coach off health (see offTopic.ts) is warned
 * after the day's 5th decline and paused after 3 more. A paused account gets 403 account_disabled
 * on every request, with a ready-made email asking for a review.
 *
 * State lives in health_app_events (kind account_disabled / account_enabled, newest wins), so no
 * migration is needed and every change is on the record. To re-enable someone, insert an
 * account_enabled row for their profile (SQL in docs/ACCOUNT_REVIEW.md). The owner is never paused.
 */
import { logger } from "../logger.js";
import { supabase } from "../tools/clients.js";
import { loggableError } from "../util/loggableError.js";
import { isOwnerProfile } from "./accounts.js";

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; disabled: boolean }>();

/** True when the person's newest account event is a pause. Cached for a minute. */
export async function isAccountDisabled(userProfileId: string, now = Date.now()): Promise<boolean> {
  const hit = cache.get(userProfileId);
  if (hit && now - hit.at < CACHE_MS) return hit.disabled;
  let disabled = false;
  try {
    const { data, error } = await supabase
      .from("health_app_events")
      .select("kind")
      .eq("user_profile_id", userProfileId)
      .in("kind", ["account_disabled", "account_enabled"])
      .order("occurred_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    disabled = (data?.[0] as { kind?: string } | undefined)?.kind === "account_disabled";
  } catch (err) {
    // A failed read never locks anyone out.
    logger.warn({ err: loggableError(err) }, "account status read failed");
  }
  if (cache.size > 20_000) cache.clear();
  cache.set(userProfileId, { at: now, disabled });
  return disabled;
}

/** Pauses the account now (written straight away, not queued). The owner is never paused. */
export async function disableAccount(userProfileId: string, reason: string, props: Record<string, unknown> = {}): Promise<boolean> {
  if (await isOwnerProfile(userProfileId).catch(() => false)) return false;
  const { error } = await supabase.from("health_app_events").insert({
    user_profile_id: userProfileId,
    session_id: null,
    source: "server",
    kind: "account_disabled",
    name: reason.slice(0, 60),
    duration_ms: null,
    status: 403,
    props,
    app_version: null,
    user_agent: null,
    occurred_at: new Date().toISOString(),
  });
  if (error) {
    logger.error({ error: error.message, userProfileId }, "account disable failed");
    return false;
  }
  cache.set(userProfileId, { at: Date.now(), disabled: true });
  logger.warn({ userProfileId, reason }, "account paused");
  return true;
}

/** Where review requests go: MAGNUS_SUPPORT_EMAIL, else the owner's email. */
export function supportEmail(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.MAGNUS_SUPPORT_EMAIL?.trim() || env.MAGNUS_OWNER_EMAIL?.trim() || null;
}

/** The body of a 403 for a paused account: what happened and a draft email asking for a review. */
export function disabledResponse(userProfileId: string, env: NodeJS.ProcessEnv = process.env) {
  const to = supportEmail(env);
  const subject = "Magnus account review request";
  const body = [
    "Hi,",
    "",
    "My Magnus account was paused for off-topic use of the coach. I think this was a mistake.",
    "",
    "What happened (in my words):",
    "",
    "",
    `Account reference: ${userProfileId}`,
    "",
    "Thanks",
  ].join("\n");
  return {
    error: "account_disabled",
    message: "This account is paused because the coach was asked many times for things other than health. If you think that's wrong, ask for a review and we'll look at it.",
    review: to ? { to, subject, body, mailto: `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` } : null,
  };
}

export function _resetAccountStatus(): void {
  cache.clear();
}
