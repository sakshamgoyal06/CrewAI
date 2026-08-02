-- Per-user YouTube OAuth refresh token (separate from calendar).

ALTER TABLE public.user_integrations
  ADD COLUMN IF NOT EXISTS google_youtube_refresh_token TEXT;

COMMENT ON COLUMN public.user_integrations.google_youtube_refresh_token IS
  'YouTube Data API OAuth refresh token for this user (playlists, likes).';
