/**
 * Kite Connect credentials — platform app keys on the host; per-user access token in Supabase.
 * https://kite.trade/docs/connect/v3/
 */
import { loadUserIntegrations } from "../../../users/userIntegrations.js";

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

export function kitePlatformReady(): boolean {
  return Boolean(kiteApiKeyFromEnv() && kiteApiSecretFromEnv());
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
  | { apiKey: string; accessToken: string }
  | { apiKey?: undefined; accessToken?: undefined }
> {
  const apiKey = kiteApiKeyFromEnv();
  const accessToken = await kiteAccessTokenForUser(userProfileId);
  if (!apiKey || !accessToken) {
    return {};
  }
  return { apiKey, accessToken };
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
