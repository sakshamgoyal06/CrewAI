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
