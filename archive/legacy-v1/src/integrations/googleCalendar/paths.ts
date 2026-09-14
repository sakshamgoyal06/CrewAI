import { homedir } from "node:os";
import { join } from "node:path";

export function googleOAuthCredentialsPath(): string | undefined {
  return (
    process.env.GOOGLE_OAUTH_CREDENTIALS?.trim() ||
    process.env.GOOGLE_CALENDAR_OAUTH_CREDENTIALS?.trim() ||
    undefined
  );
}

export function googleCalendarTokenPath(): string {
  const fromEnv = process.env.GOOGLE_CALENDAR_TOKEN_PATH?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return join(homedir(), ".config", "magnus", "google-calendar-token.json");
}

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
] as const;
