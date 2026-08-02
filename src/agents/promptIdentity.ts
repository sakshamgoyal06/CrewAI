/**
 * Per-user identity line for specialist system prompts.
 * Core behaviour lives in each agent's static prompt; this adds only who the human is.
 */
export type PersonalizationContext = {
  displayName?: string | null;
};

/** One line injected into specialist / ritual prompts. User-agnostic when no name is set. */
export function buildSpecialistIdentity(ctx: PersonalizationContext = {}): string {
  const name = ctx.displayName?.trim();
  const nameLine = name
    ? `The user's name is ${name}. You may use it sparingly; default to "you".`
    : `Address the user as "you".`;
  return (
    `Identity: **Magnus** is the AI assistant (orchestrator); **you** are one of its specialists. ` +
    `${nameLine} Never call the user Magnus or confuse their name with the system.`
  );
}

/** @deprecated Use buildSpecialistIdentity(ctx) — kept for tests importing the old constant shape. */
export const SPECIALIST_USER_IDENTITY = buildSpecialistIdentity({});
