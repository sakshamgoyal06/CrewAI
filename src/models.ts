/**
 * Every Claude model id the server uses, in one place. Each has an env override so a model can
 * be swapped on Railway without a deploy.
 */
type Env = NodeJS.ProcessEnv;

const pick = (value: string | undefined, fallback: string) => value?.trim() || fallback;

/** Coach chat. Sonnet answers a tool-heavy turn several times faster than Opus. */
export const chatModel = (env: Env = process.env) => pick(env.MAGNUS_HEALTH_CHAT_MODEL, "claude-sonnet-5-5");

/** Short routine logging turns (about 20x cheaper per token than Sonnet). */
export const chatFastModel = (env: Env = process.env) => pick(env.MAGNUS_HEALTH_CHAT_FAST_MODEL, "claude-haiku-5-5");

/** "Why" analysis. Its own setting, so changing the chat model never changes this one. */
export const rcaModel = (env: Env = process.env) => pick(env.MAGNUS_RCA_MODEL, "claude-sonnet-5-5");

/** Nightly coach digest: one short note per person per night. */
export const digestModel = (env: Env = process.env) => pick(env.MAGNUS_DIGEST_MODEL, "claude-haiku-5-5");

/** Meal photo reading. */
export const photoMealModel = (env: Env = process.env) => pick(env.MAGNUS_MEAL_PHOTO_MODEL, "claude-sonnet-5-5");

/** Meal nutrition lookups (text estimate, web research, ingredient breakdown). */
export const mealLookupModel = (env: Env = process.env) => pick(env.MAGNUS_MEAL_LOOKUP_MODEL, "claude-sonnet-4-6");
