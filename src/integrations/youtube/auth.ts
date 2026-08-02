/**
 * YouTube OAuth for the deployed bot and local first-time setup.
 *
 * Same pattern as Google Calendar: host uses `GOOGLE_CLIENT_ID` /
 * `GOOGLE_CLIENT_SECRET` / `GOOGLE_YOUTUBE_REFRESH_TOKEN` (no disk). Locally the
 * auth script writes a token file and prints the refresh token to paste on the host.
 *
 * YouTube scopes are separate from Calendar, so the refresh tokens are separate too.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { google } from "googleapis";

import {
  GOOGLE_YOUTUBE_SCOPES,
  googleOAuthCredentialsPath,
  googleYoutubeTokenPath,
} from "./paths.js";

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

type InstalledCredentials = {
  client_id: string;
  client_secret: string;
  redirect_uris?: string[];
};

function envValue(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

function loadClientCredentials(): InstalledCredentials {
  const id = envValue("GOOGLE_CLIENT_ID");
  const secret = envValue("GOOGLE_CLIENT_SECRET");
  if (id && secret) {
    return { client_id: id, client_secret: secret };
  }

  const path = googleOAuthCredentialsPath();
  if (!path) {
    throw new Error(
      "YouTube is not configured. For first-time setup set GOOGLE_OAUTH_CREDENTIALS to your " +
        "OAuth desktop client JSON; for the deployed bot set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET " +
        "and GOOGLE_YOUTUBE_REFRESH_TOKEN. See docs/YOUTUBE.md.",
    );
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    installed?: InstalledCredentials;
    web?: InstalledCredentials;
  };
  const creds = raw.installed ?? raw.web;
  if (!creds?.client_id || !creds.client_secret) {
    throw new Error(`Invalid OAuth credentials file: ${path}`);
  }
  return creds;
}

export function createOAuth2Client(redirectUri?: string): OAuth2Client {
  const creds = loadClientCredentials();
  const redirect = redirectUri ?? creds.redirect_uris?.[0] ?? "http://127.0.0.1";
  return new google.auth.OAuth2(creds.client_id, creds.client_secret, redirect);
}

export function resolvedClientCredentials(): { clientId: string; clientSecret: string } {
  const creds = loadClientCredentials();
  return { clientId: creds.client_id, clientSecret: creds.client_secret };
}

/** True when OAuth can run without a browser (playlists, likes, private library). */
export function youtubeOauthConfigured(): boolean {
  if (
    envValue("GOOGLE_CLIENT_ID") &&
    envValue("GOOGLE_CLIENT_SECRET") &&
    envValue("GOOGLE_YOUTUBE_REFRESH_TOKEN")
  ) {
    return true;
  }
  return Boolean(googleOAuthCredentialsPath()) && existsSync(googleYoutubeTokenPath());
}

/** API key alone can search and recommend; it cannot touch the user's playlists. */
export function youtubeApiKeyConfigured(): boolean {
  return Boolean(envValue("YOUTUBE_API_KEY") || envValue("GOOGLE_YOUTUBE_API_KEY"));
}

export function youtubeConfigured(): boolean {
  return youtubeOauthConfigured() || youtubeApiKeyConfigured();
}

export function youtubeApiKey(): string | undefined {
  return envValue("YOUTUBE_API_KEY") || envValue("GOOGLE_YOUTUBE_API_KEY");
}

export function loadSavedToken(client: OAuth2Client): boolean {
  const tokenPath = googleYoutubeTokenPath();
  if (!existsSync(tokenPath)) {
    return false;
  }
  client.setCredentials(JSON.parse(readFileSync(tokenPath, "utf8")));
  return true;
}

export function saveToken(client: OAuth2Client): void {
  const tokenPath = googleYoutubeTokenPath();
  const creds = client.credentials;
  if (!creds.access_token) {
    throw new Error("No credentials to save — complete OAuth first.");
  }
  mkdirSync(dirname(tokenPath), { recursive: true });
  writeFileSync(tokenPath, JSON.stringify(creds, null, 2), "utf8");
}

export function getAuthUrl(client: OAuth2Client): string {
  return client.generateAuthUrl({
    access_type: "offline",
    scope: [...GOOGLE_YOUTUBE_SCOPES],
    prompt: "consent",
  });
}

export async function exchangeCodeForToken(
  client: OAuth2Client,
  code: string,
): Promise<void> {
  const { tokens } = await client.getToken(code.trim());
  client.setCredentials(tokens);
  saveToken(client);
}

export async function getAuthenticatedYoutubeClient(): Promise<{
  auth: OAuth2Client;
  youtube: ReturnType<typeof google.youtube>;
}> {
  if (!youtubeOauthConfigured()) {
    throw new Error(
      "YouTube OAuth is not connected. Run `npm run youtube:auth` locally, then set GOOGLE_YOUTUBE_REFRESH_TOKEN on the host.",
    );
  }

  const auth = createOAuth2Client();
  const refreshToken = envValue("GOOGLE_YOUTUBE_REFRESH_TOKEN");

  if (refreshToken) {
    auth.setCredentials({ refresh_token: refreshToken });
  } else if (!loadSavedToken(auth)) {
    throw new Error(
      "YouTube is not authenticated. Run `npm run youtube:auth` locally, then set GOOGLE_YOUTUBE_REFRESH_TOKEN on the host.",
    );
  } else {
    auth.on("tokens", (tokens) => {
      if (tokens.refresh_token) {
        auth.setCredentials({ ...auth.credentials, ...tokens });
        saveToken(auth);
      }
    });
  }

  return { auth, youtube: google.youtube({ version: "v3", auth }) };
}

/** Key-only client for public search / charts when OAuth is absent. */
export function getApiKeyYoutubeClient(): ReturnType<typeof google.youtube> {
  const key = youtubeApiKey();
  if (!key) {
    throw new Error(
      "YouTube API key is not set. Set YOUTUBE_API_KEY, or connect OAuth (see docs/YOUTUBE.md).",
    );
  }
  return google.youtube({ version: "v3", auth: key });
}
