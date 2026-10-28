/**
 * Magnus tool: connect Google Calendar + YouTube in one consent link.
 */
import { loadUserIntegrations } from "../../users/userIntegrations.js";
import {
  beginGoogleOauth,
  googleOauthLinkAvailable,
  googleOauthRedirectConfigured,
} from "../../integrations/google/oauthFlow.js";

function platformGoogleOAuthReady(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}

export async function connectGoogleTool(input: {
  userProfileId: string;
  telegramUserId: string;
}): Promise<string> {
  const integrations = await loadUserIntegrations(input.userProfileId);
  const calendarOk = Boolean(integrations.googleCalendarRefreshToken);
  const youtubeOk = Boolean(integrations.googleYoutubeRefreshToken);

  if (calendarOk && youtubeOk) {
    return (
      "Google is already connected for this account (Calendar and YouTube). " +
      "I can manage your schedule, search, playlists, bookmarks, and cues."
    );
  }

  if (!platformGoogleOAuthReady()) {
    return "Google cannot be connected yet — the host is missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (Web application client).";
  }

  if (!googleOauthLinkAvailable()) {
    const redirect = googleOauthRedirectConfigured();
    return (
      "I cannot build a connect link without a public HTTPS URL for the callback. " +
      "Set MAGNUS_PUBLIC_BASE_URL (or deploy with RAILWAY_PUBLIC_DOMAIN). " +
      (redirect ? `Expected redirect: ${redirect}` : "")
    );
  }

  const started = await beginGoogleOauth({
    userProfileId: input.userProfileId,
    telegramChatId: input.telegramUserId,
  });
  if (!started.ok) {
    return started.error;
  }

  const partial =
    calendarOk || youtubeOk
      ? " (this refreshes Calendar and YouTube together for the Web OAuth client on the host)"
      : "";

  return [
    `Open this link to connect Google Calendar + YouTube / YT Music to Magnus${partial} (expires in about 15 minutes):`,
    started.authUrl,
    "",
    "After you approve, I will save the connection for your account and confirm here. " +
      `OAuth client must be type Web application; redirect URI must be exactly: ${started.redirectUri}`,
  ].join("\n");
}

/** Alias — same unified consent as connect_google. */
export async function connectYoutubeTool(input: {
  userProfileId: string;
  telegramUserId: string;
}): Promise<string> {
  return connectGoogleTool(input);
}

/** Alias — same unified consent as connect_google. */
export async function connectCalendarTool(input: {
  userProfileId: string;
  telegramUserId: string;
}): Promise<string> {
  return connectGoogleTool(input);
}
