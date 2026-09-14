-- Durable memory topics (Claude-style editable facts) — one row per topic_key per user.

CREATE TABLE IF NOT EXISTS public.memory_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  topic_key TEXT NOT NULL,
  label TEXT NOT NULL,
  body TEXT NOT NULL,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT memory_topics_user_key UNIQUE (user_profile_id, topic_key),
  CONSTRAINT memory_topics_key_nonempty CHECK (char_length(trim(topic_key)) > 0),
  CONSTRAINT memory_topics_label_nonempty CHECK (char_length(trim(label)) > 0),
  CONSTRAINT memory_topics_body_nonempty CHECK (char_length(trim(body)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_memory_topics_user_updated
  ON public.memory_topics (user_profile_id, updated_at DESC);

ALTER TABLE public.memory_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.memory_topics;
CREATE POLICY service_role_only ON public.memory_topics
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.memory_topics IS
  'Curated user memory topics (upsert by topic_key). Index in prompts; full body on demand.';
COMMENT ON COLUMN public.memory_topics.topic_key IS
  'Stable slug, e.g. preference:meal_timing, rule:avoid_lauki';
COMMENT ON COLUMN public.memory_topics.label IS
  'Short human-readable title for memory index in prompts';
COMMENT ON COLUMN public.memory_topics.body IS
  'Full fact text; newer upsert wins for the same topic_key';
