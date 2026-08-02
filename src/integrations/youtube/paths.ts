import { homedir } from "node:os";
import { join } from "node:path";

export function googleOAuthCredentialsPath(): string | undefined {
  return (
    process.env.GOOGLE_OAUTH_CREDENTIALS?.trim() ||
    process.env.GOOGLE_YOUTUBE_OAUTH_CREDENTIALS?.trim() ||
    process.env.GOOGLE_CALENDAR_OAUTH_CREDENTIALS?.trim() ||
    undefined
  );
}

export function googleYoutubeTokenPath(): string {
  const fromEnv = process.env.GOOGLE_YOUTUBE_TOKEN_PATH?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return join(homedir(), ".config", "magnus", "google-youtube-token.json");
}

/**
 * Full YouTube account access (playlists, likes, uploads metadata). Narrower than
 * `youtube` alone for HTTPS-only clients; covers create/load playlist and rate.
 */
export const GOOGLE_YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.force-ssl",
] as const;

/** Music category on YouTube Data API (songs / official audio / music videos). */
export const YOUTUBE_MUSIC_CATEGORY_ID = "10";
