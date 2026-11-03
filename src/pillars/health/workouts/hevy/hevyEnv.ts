/**
 * Hevy Pro public API — https://api.hevyapp.com/docs/
 * Each person's key lives (sealed) in `user_integrations`; there is no deploy-wide key.
 */
import { loadUserIntegrations } from "../../../../users/userIntegrations.js";

export async function hevyApiKeyForUser(userProfileId?: string): Promise<string | undefined> {
  if (!userProfileId?.trim()) {
    return undefined;
  }
  const integrations = await loadUserIntegrations(userProfileId);
  return integrations.hevyApiKey;
}

export function hevyFetchTimeoutMs(): number {
  const raw = process.env.MAGNUS_HEVY_FETCH_TIMEOUT_MS?.trim() || "15000";
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? 15000 : n;
}
