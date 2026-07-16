import { join } from "node:path";

/** Root of committed health memory (user-context, learnings, recovery, journal markdown). */
export function healthReferencesDir(): string {
  const fromEnv = process.env.MAGNUS_HEALTH_REFERENCES_DIR?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return join(process.cwd(), ".cursor/skills/health/references");
}
