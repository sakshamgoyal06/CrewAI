-- Magnus YouTube library: bookmarks and an up-next cue queue that live in Supabase
-- (YouTube itself has likes and playlists; these tables are Magnus's own shortlist and queue).
--
-- Apply in the Supabase SQL Editor, or via MCP apply_migration / supabase db push.

CREATE TABLE IF NOT EXISTS public.magnus_youtube_bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  channel_title TEXT,
  kind TEXT NOT NULL DEFAULT 'video',
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  note TEXT,
  source TEXT NOT NULL DEFAULT 'telegram',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_magnus_youtube_bookmarks_kind CHECK (kind IN ('video', 'song')),
  CONSTRAINT uq_magnus_youtube_bookmarks_user_video UNIQUE (user_profile_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_magnus_youtube_bookmarks_user_created
  ON public.magnus_youtube_bookmarks (user_profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.magnus_youtube_cues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  channel_title TEXT,
  kind TEXT NOT NULL DEFAULT 'video',
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  position INTEGER NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  source TEXT NOT NULL DEFAULT 'telegram',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  played_at TIMESTAMPTZ,
  CONSTRAINT chk_magnus_youtube_cues_kind CHECK (kind IN ('video', 'song')),
  CONSTRAINT chk_magnus_youtube_cues_status CHECK (status IN ('queued', 'played', 'skipped'))
);

CREATE INDEX IF NOT EXISTS idx_magnus_youtube_cues_user_queue
  ON public.magnus_youtube_cues (user_profile_id, status, position ASC)
  WHERE status = 'queued';

CREATE TABLE IF NOT EXISTS public.magnus_youtube_state (
  user_profile_id UUID PRIMARY KEY REFERENCES public.user_profile (id) ON DELETE CASCADE,
  magnus_playlist_id TEXT,
  magnus_playlist_title TEXT NOT NULL DEFAULT 'Magnus',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_magnus_youtube_bookmarks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_magnus_youtube_bookmarks_updated ON public.magnus_youtube_bookmarks;
CREATE TRIGGER tr_magnus_youtube_bookmarks_updated
  BEFORE UPDATE ON public.magnus_youtube_bookmarks
  FOR EACH ROW EXECUTE FUNCTION public.set_magnus_youtube_bookmarks_updated_at();

CREATE OR REPLACE FUNCTION public.set_magnus_youtube_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_magnus_youtube_state_updated ON public.magnus_youtube_state;
CREATE TRIGGER tr_magnus_youtube_state_updated
  BEFORE UPDATE ON public.magnus_youtube_state
  FOR EACH ROW EXECUTE FUNCTION public.set_magnus_youtube_state_updated_at();

ALTER TABLE public.magnus_youtube_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.magnus_youtube_cues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.magnus_youtube_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.magnus_youtube_bookmarks;
CREATE POLICY service_role_only ON public.magnus_youtube_bookmarks
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_role_only ON public.magnus_youtube_cues;
CREATE POLICY service_role_only ON public.magnus_youtube_cues
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_role_only ON public.magnus_youtube_state;
CREATE POLICY service_role_only ON public.magnus_youtube_state
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.magnus_youtube_bookmarks IS
  'Magnus shortlist of YouTube / YT Music items (independent of YouTube likes).';
COMMENT ON TABLE public.magnus_youtube_cues IS
  'Up-next cue queue managed by Magnus for songs and videos.';
COMMENT ON TABLE public.magnus_youtube_state IS
  'Per-user YouTube state, including the default Magnus playlist id.';
