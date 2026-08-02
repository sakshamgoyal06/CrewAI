-- Per-user YouTube OAuth refresh token (platform keeps GOOGLE_CLIENT_ID / SECRET only).

ALTER TABLE public.user_integrations
  ADD COLUMN IF NOT EXISTS youtube_refresh_token TEXT;

COMMENT ON COLUMN public.user_integrations.youtube_refresh_token IS
  'YouTube Data API OAuth refresh token for this user (playlists, likes, library). Separate from google_calendar_refresh_token.';
