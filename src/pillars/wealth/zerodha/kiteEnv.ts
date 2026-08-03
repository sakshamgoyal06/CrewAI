/**
 * Kite Connect credentials — multi-user model (like Google OAuth).
 *
 * - **Platform:** KITE_API_KEY + KITE_API_SECRET on the host — one Magnus Kite app for all users.
 * - **Per user:** access_token (+ zerodha user id) in user_integrations after OAuth login.
 * - **Optional override:** per-user kite_api_key/secret in DB for dev only (ignored when platform is set).
 *
 * https://kite.trade/docs/connect/v3/
 */
import { loadUserIntegrations } from "../../../users/userIntegrations.js";

export type KiteAppCredentials = {
  apiKey: string;
  apiSecret: string;
};

/** Read-only today. Set MAGNUS_KITE_ORDERS_ENABLED=true to allow order APIs (future phase). */
export function kiteOrdersEnabled(): boolean {
  const v = process.env.MAGNUS_KITE_ORDERS_ENABLED?.trim().toLowerCase();
  return v === "true" || v === "1";
}

export function kiteApiKeyFromEnv(): string | undefined {
  const k =
    process.env.KITE_API_KEY?.trim() || process.env.MAGNUS_KITE_API_KEY?.trim() || "";
  return k || undefined;
}

export function kiteApiSecretFromEnv(): string | undefined {
  const s =
    process.env.KITE_API_SECRET?.trim() ||
    process.env.MAGNUS_KITE_API_SECRET?.trim() ||
    "";
  return s || undefined;
}

export function kiteAppCredentialsFromEnv(): KiteAppCredentials | undefined {
  const apiKey = kiteApiKeyFromEnv();
  const apiSecret = kiteApiSecretFromEnv();
  if (!apiKey || !apiSecret) {
    return undefined;
  }
  return { apiKey, apiSecret };
}

/** True when the Magnus Kite app is configured on the host (required for multi-user). */
export function kitePlatformReady(): boolean {
  return Boolean(kiteAppCredentialsFromEnv());
}

/**
 * Resolve Kite app credentials: platform env first (multi-user), optional per-user DB override
 * when platform env is unset (local dev / single-user experiments only).
 */
export async function kiteAppCredentialsForUser(
  userProfileId?: string,
): Promise<KiteAppCredentials | undefined> {
  const platform = kiteAppCredentialsFromEnv();
  if (platform) {
    return platform;
  }
  if (userProfileId?.trim()) {
    const integrations = await loadUserIntegrations(userProfileId);
    const apiKey = integrations.kiteApiKey;
    const apiSecret = integrations.kiteApiSecret;
    if (apiKey && apiSecret) {
      return { apiKey, apiSecret };
    }
  }
  return undefined;
}

export async function kiteUserHasAppCredentials(userProfileId?: string): Promise<boolean> {
  return Boolean(await kiteAppCredentialsForUser(userProfileId));
}

export async function kiteAccessTokenForUser(
  userProfileId?: string,
): Promise<string | undefined> {
  if (!userProfileId?.trim()) {
    return undefined;
  }
  const integrations = await loadUserIntegrations(userProfileId);
  return integrations.kiteAccessToken;
}

export async function kiteCredentialsForUser(userProfileId?: string): Promise<
  | { apiKey: string; apiSecret: string; accessToken: string }
  | { apiKey?: undefined; apiSecret?: undefined; accessToken?: undefined }
> {
  const app = await kiteAppCredentialsForUser(userProfileId);
  const accessToken = await kiteAccessTokenForUser(userProfileId);
  if (!app || !accessToken) {
    return {};
  }
  return { ...app, accessToken };
}

export function kiteFetchTimeoutMs(): number {
  const raw = process.env.MAGNUS_KITE_FETCH_TIMEOUT_MS?.trim() || "15000";
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) ? 15000 : n;
}

export function kiteLoginBaseUrl(): string {
  return process.env.MAGNUS_KITE_LOGIN_BASE_URL?.trim() || "https://kite.zerodha.com";
}

export function kiteApiBaseUrl(): string {
  return process.env.MAGNUS_KITE_API_BASE_URL?.trim() || "https://api.kite.trade";
}
