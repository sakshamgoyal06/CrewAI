import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
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

function loadInstalledCredentials(): InstalledCredentials {
  const path = googleOAuthCredentialsPath();
  if (!path) {
    throw new Error(
      "Missing GOOGLE_OAUTH_CREDENTIALS — path to Google OAuth Desktop client JSON (see docs/GOOGLE_CALENDAR_MCP.md).",
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

export function createOAuth2Client(): OAuth2Client {
  const creds = loadInstalledCredentials();
  const redirect =
    creds.redirect_uris?.[0] ?? "urn:ietf:wg:oauth:2.0:oob";
  return new google.auth.OAuth2(creds.client_id, creds.client_secret, redirect);
}

export function loadSavedToken(client: OAuth2Client): boolean {
  const tokenPath = googleCalendarTokenPath();
  if (!existsSync(tokenPath)) {
    return false;
  }
  const token = JSON.parse(readFileSync(tokenPath, "utf8"));
  client.setCredentials(token);
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
  if (!loadSavedToken(auth)) {
    throw new Error(
      `Google Calendar not authenticated. Run: npx tsx scripts/google-calendar-auth.mts`,
    );
  }
  auth.on("tokens", (tokens) => {
    if (tokens.refresh_token) {
      auth.setCredentials({ ...auth.credentials, ...tokens });
      saveToken(auth);
    }
  });
  const calendar = google.calendar({ version: "v3", auth });
  return { auth, calendar };
}
