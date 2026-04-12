/**
 * Repository-wide toggles (environment). Tune for beta vs mass scale without code changes.
 */

/**
 * When true (default), Telegram sends a short notice as soon as Magnus commits to a
 * specialist (right after intent classification), before memory load and before that
 * specialist runs. Requires `sendProgress` from the bot (see `handleMessage`). Set
 * `MAGNUS_DELEGATION_NOTICE=false` to disable extra messages at scale.
 */
export function isDelegationNoticeEnabled(): boolean {
  const v = process.env.MAGNUS_DELEGATION_NOTICE?.trim().toLowerCase();
  if (v === "false" || v === "0" || v === "no" || v === "off") {
    return false;
  }
  return true;
}
