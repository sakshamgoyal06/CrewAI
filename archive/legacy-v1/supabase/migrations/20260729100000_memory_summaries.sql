-- Rolling conversation summaries and extracted semantic facts (Magnus memory Phases 2–3).
-- Rows are append-only: loaders take the newest row per period.

CREATE TABLE IF NOT EXISTS public.memory_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  summary_text TEXT NOT NULL,
  period TEXT NOT NULL,
  window_days INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_memory_summaries_period_nonempty CHECK (char_length(trim(period)) > 0),
  CONSTRAINT chk_memory_summaries_text_nonempty CHECK (char_length(trim(summary_text)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_memory_summaries_user_period_created
  ON public.memory_summaries (user_profile_id, period, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_summaries_user_created
  ON public.memory_summaries (user_profile_id, created_at DESC);

ALTER TABLE public.memory_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.memory_summaries;
CREATE POLICY service_role_only ON public.memory_summaries
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.memory_summaries IS
  'Append-only memory store: conversation_rolling (compressed older chat), semantic_facts (JSON {facts:[]}), legacy 7d/30d windows.';
COMMENT ON COLUMN public.memory_summaries.period IS
  'conversation_rolling | semantic_facts | 7d | 30d (legacy window labels).';
COMMENT ON COLUMN public.memory_summaries.summary_text IS
  'Plain-text rolling summary, or JSON {"facts":["..."]} for semantic_facts.';
