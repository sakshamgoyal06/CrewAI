/**
 * Health app auth: one personal bearer token mapped to one `user_profile`.
 * Token stays in the PWA's local storage; rotate it by changing the env var.
 */
import { createHash, timingSafeEqual } from "node:crypto";

export type HealthAppAuthConfig = {
  token: string;
  userProfileId: string;
};

const DEFAULT_OWNER_PROFILE_ID = "73365666-4285-42af-a59e-43ba68ea65c0";

export function healthAppAuthConfig(): HealthAppAuthConfig | null {
  const token = process.env.MAGNUS_HEALTH_APP_TOKEN?.trim() || "";
  // TEMP default (not a secret) so only the token has to be set in Railway. Cleanup: move to env.
  const userProfileId = process.env.MAGNUS_HEALTH_APP_USER_PROFILE_ID?.trim() || DEFAULT_OWNER_PROFILE_ID;
  if (token.length < 24 || !userProfileId) {
    return null;
  }
  return { token, userProfileId };
}

function digest(s: string): Buffer {
  return createHash("sha256").update(s).digest();
}

/** Returns the user profile id when `authorizationHeader` carries the configured token. */
export function authenticateHealthApp(
  authorizationHeader: string | undefined,
  config: HealthAppAuthConfig | null,
): string | null {
  if (!config || !authorizationHeader) {
    return null;
  }
  const m = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!m) {
    return null;
  }
  return timingSafeEqual(digest(m[1]!.trim()), digest(config.token)) ? config.userProfileId : null;
}
