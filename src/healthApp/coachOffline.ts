import { logger } from "../logger.js";
import { sendNotification, type Notification } from "./push.js";

/** The owner's profile (same default as auth.ts); MAGNUS_HEALTH_APP_USER_PROFILE_ID overrides it. */
const OWNER_PROFILE_ID = "73365666-4285-42af-a59e-43ba68ea65c0";

/**
 * Errors from the model provider that a retry can't fix: the API account is out of credit, or
 * the key was revoked. The chat says so plainly instead of "Tap Retry", and the log line is
 * tagged so it's easy to find.
 */
const PATTERNS = [
  /credit balance is too low/i,
  /plans\s*&\s*billing/i,
  /authentication_error/i,
  /invalid x-api-key/i,
  /permission_error/i,
];

export const COACH_OFFLINE_MESSAGE =
  "The coach is offline right now because of an account issue on our side, not your message. You can still log from the Today tab.";

export function isCoachOffline(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err);
  return PATTERNS.some((p) => p.test(text));
}

/**
 * Tells the owner, by push, that the coach is offline, so a credit outage isn't found by
 * opening the app. One push per hour at most (the dedupe key holds the UTC hour); a failed push
 * is logged and never affects the person's reply.
 */
export async function alertOwnerCoachOffline(
  now: Date = new Date(),
  send: (userProfileId: string, n: Notification) => Promise<unknown> = sendNotification,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const ownerId = env.MAGNUS_HEALTH_APP_USER_PROFILE_ID?.trim() || OWNER_PROFILE_ID;
  try {
    await send(ownerId, {
      kind: "ops_alert",
      dedupeKey: `coach_offline:${now.toISOString().slice(0, 13)}`,
      title: "Magnus coach is offline",
      body: "The Anthropic account refused a chat turn (credit or key). Top up or check the key in the Anthropic Console.",
      url: "/app/#coach",
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "coach offline alert failed");
  }
}
