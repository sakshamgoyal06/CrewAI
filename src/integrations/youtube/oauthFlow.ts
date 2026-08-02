/**
 * Back-compat aliases — in-chat connect is now unified Google (Calendar + YouTube).
 * Prefer `integrations/google/oauthFlow.js`.
 */
export {
  beginGoogleOauth as beginYoutubeOauth,
  completeGoogleOauth as completeYoutubeOauth,
  googleOauthLinkAvailable as youtubeOauthLinkAvailable,
  googleOauthRedirectConfigured as youtubeOauthRedirectConfigured,
  type GoogleOauthCallbackResult as YoutubeOauthCallbackResult,
  type GoogleOauthState as YoutubeOauthState,
} from "../google/oauthFlow.js";
