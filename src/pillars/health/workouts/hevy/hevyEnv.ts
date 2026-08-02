/**
 * Hevy Pro public API — https://api.hevyapp.com/docs/
 * Per-user keys in `user_integrations`; env vars are deploy-owner fallback only.
 */
import { loadUserIntegrations } from "../../../../users/userIntegrations.js";

export function hevyApiKeyFromEnv(): string | undefined {
  const k =
    process.env.HEVY_API_KEY?.trim() || process.env.MAGNUS_HEVY_API_KEY?.trim() || "";
  return k || undefined;
}

export async function hevyApiKeyForUser(userProfileId?: string): Promise<string | undefined> {
  if (userProfileId?.trim()) {
    const integrations = await loadUserIntegrations(userProfileId);
    if (integrations.hevyApiKey) {
      return integrations.hevyApiKey;
    }
  }
  return hevyApiKeyFromEnv();
}

export function hevyFetchTimeoutMs(): number {
  const raw = process.env.MAGNUS_HEVY_FETCH_TIMEOUT_MS?.trim() || "15000";
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? 15000 : n;
}
