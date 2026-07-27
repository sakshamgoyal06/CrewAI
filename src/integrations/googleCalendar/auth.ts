/**
 * Google Calendar OAuth for two very different environments.
 *
 * **Deployed bot:** no browser, no writable home directory, no persistent disk. Credentials come
 * from `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_CALENDAR_REFRESH_TOKEN`; the client
 * exchanges the refresh token for access tokens on demand and never writes to disk.
 *
 * **Local / first-time setup:** the desktop OAuth flow in `scripts/google-calendar-auth.mts`
 * writes a token file, and also prints the refresh token to paste into the host's env.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { google } from "googleapis";

import {
  GOOGLE_CALENDAR_SCOPES,
  googleCalendarTokenPath,
  googleOAuthCredentialsPath,
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

/** Client id and secret from env, falling back to the desktop credentials JSON. */
function loadClientCredentials(): InstalledCredentials {
  const id = envValue("GOOGLE_CLIENT_ID");
  const secret = envValue("GOOGLE_CLIENT_SECRET");
  if (id && secret) {
    return { client_id: id, client_secret: secret };
  }

  const path = googleOAuthCredentialsPath();
  if (!path) {
    throw new Error(
      "Google Calendar is not configured. For first-time setup set GOOGLE_OAUTH_CREDENTIALS to your " +
        "OAuth desktop client JSON; for the deployed bot set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET " +
        "and GOOGLE_CALENDAR_REFRESH_TOKEN. See docs/GOOGLE_CALENDAR.md.",
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

/**
 * `redirectUri` overrides the credentials file. Desktop clients may use any loopback port, which is
 * how the auth script captures the code without copy-paste — Google retired the out-of-band flow,
 * so loopback is the only workable option.
 */
export function createOAuth2Client(redirectUri?: string): OAuth2Client {
  const creds = loadClientCredentials();
  const redirect = redirectUri ?? creds.redirect_uris?.[0] ?? "http://127.0.0.1";
  return new google.auth.OAuth2(creds.client_id, creds.client_secret, redirect);
}

/**
 * The resolved client id and secret, wherever they came from — so the auth script can print the
 * exact values to paste into the host instead of telling you to go find them.
 */
export function resolvedClientCredentials(): { clientId: string; clientSecret: string } {
  const creds = loadClientCredentials();
  return { clientId: creds.client_id, clientSecret: creds.client_secret };
}

/** True when the deployed bot can authenticate without any user interaction. */
export function googleCalendarConfigured(): boolean {
  if (
    envValue("GOOGLE_CLIENT_ID") &&
    envValue("GOOGLE_CLIENT_SECRET") &&
    envValue("GOOGLE_CALENDAR_REFRESH_TOKEN")
  ) {
    return true;
  }
  return Boolean(googleOAuthCredentialsPath()) && existsSync(googleCalendarTokenPath());
}

export function loadSavedToken(client: OAuth2Client): boolean {
  const tokenPath = googleCalendarTokenPath();
  if (!existsSync(tokenPath)) {
    return false;
  }
  client.setCredentials(JSON.parse(readFileSync(tokenPath, "utf8")));
  return true;
}

export function saveToken(client: OAuth2Client): void {
  const tokenPath = googleCalendarTokenPath();
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
    scope: [...GOOGLE_CALENDAR_SCOPES],
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

export async function getAuthenticatedCalendarClient(): Promise<{
  auth: OAuth2Client;
  calendar: ReturnType<typeof google.calendar>;
}> {
  const auth = createOAuth2Client();
  const refreshToken = envValue("GOOGLE_CALENDAR_REFRESH_TOKEN");

  if (refreshToken) {
    auth.setCredentials({ refresh_token: refreshToken });
  } else if (!loadSavedToken(auth)) {
    throw new Error(
      "Google Calendar is not authenticated. Run `npm run google-calendar:auth` locally, then set GOOGLE_CALENDAR_REFRESH_TOKEN on the host.",
    );
  } else {
    // File-backed local runs: persist refreshed tokens so the next run stays authenticated.
    auth.on("tokens", (tokens) => {
      if (tokens.refresh_token) {
        auth.setCredentials({ ...auth.credentials, ...tokens });
        saveToken(auth);
      }
    });
  }

  return { auth, calendar: google.calendar({ version: "v3", auth }) };
}
