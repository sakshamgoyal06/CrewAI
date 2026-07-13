/**
 * Hevy Pro public API — https://api.hevyapp.com/docs/ — key from https://hevy.com/settings?developer
 * One env key is shared for the whole Magnus process (personal bot); multi-user would need per-profile storage.
 */

export function hevyApiKeyFromEnv(): string | undefined {
  const k =
    process.env.HEVY_API_KEY?.trim() || process.env.MAGNUS_HEVY_API_KEY?.trim() || "";
  return k || undefined;
}

export function hevyFetchTimeoutMs(): number {
  const raw = process.env.MAGNUS_HEVY_FETCH_TIMEOUT_MS?.trim() || "15000";
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? 15000 : n;
}
