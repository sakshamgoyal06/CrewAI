/**
 * Magnus tool: start YouTube onboarding — returns a one-time Google consent link.
 */
import { loadUserIntegrations } from "../../users/userIntegrations.js";
import {
  beginYoutubeOauth,
  youtubeOauthLinkAvailable,
  youtubeOauthRedirectConfigured,
} from "../../integrations/youtube/oauthFlow.js";
import { youtubeOauthReadyForUser, youtubePlatformConfigured } from "../../integrations/youtube/auth.js";

export async function connectYoutubeTool(input: {
  userProfileId: string;
  telegramUserId: string;
}): Promise<string> {
  if (await youtubeOauthReadyForUser(input.userProfileId)) {
    const integrations = await loadUserIntegrations(input.userProfileId);
    if (integrations.youtubeRefreshToken) {
      return "YouTube is already connected for this account. You can search, manage playlists, bookmark, and cue.";
    }
  }

  if (!youtubePlatformConfigured()) {
    return "YouTube cannot be connected yet — the host is missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.";
  }

  if (!youtubeOauthLinkAvailable()) {
    const redirect = youtubeOauthRedirectConfigured();
    return (
      "I cannot build a connect link without a public HTTPS URL for the callback. " +
      "Set MAGNUS_PUBLIC_BASE_URL (or deploy with RAILWAY_PUBLIC_DOMAIN). " +
      (redirect ? `Expected redirect: ${redirect}` : "")
    );
  }

  const started = await beginYoutubeOauth({
    userProfileId: input.userProfileId,
    telegramChatId: input.telegramUserId,
  });
  if (!started.ok) {
    return started.error;
  }

  return [
    "Open this link to connect your YouTube / YT Music account to Magnus (expires in about 15 minutes):",
    started.authUrl,
    "",
    "After you approve, I will save the connection for your account and confirm here. " +
      `Redirect URI registered on the Google OAuth client must be exactly: ${started.redirectUri}`,
  ].join("\n");
}
