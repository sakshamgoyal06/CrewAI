-- Cache pillar playlist ids (wisdom, wealth, etc.) so Magnus does not re-ask for PL… ids.

ALTER TABLE public.magnus_youtube_state
  ADD COLUMN IF NOT EXISTS playlist_aliases JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.magnus_youtube_state.playlist_aliases IS
  'Map of lowercase alias → { playlist_id, title } for pillar playlists (wisdom, wealth, …).';
