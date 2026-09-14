-- Durable free-form daily notes from Magnus (Telegram / Notion agent).
-- Complements Notion human-readable surface and structured `daily_scores` (pillar sliders).
-- Apply in Supabase SQL Editor or: supabase db push (if using CLI).

CREATE TABLE IF NOT EXISTS public.magnus_daily_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  body TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'telegram',
  notion_page_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_magnus_daily_logs_source CHECK (
    source IN ('telegram', 'notion', 'system')
  )
);

CREATE INDEX IF NOT EXISTS idx_magnus_daily_logs_user_date
  ON public.magnus_daily_logs (user_profile_id, log_date DESC);

CREATE INDEX IF NOT EXISTS idx_magnus_daily_logs_user_created
  ON public.magnus_daily_logs (user_profile_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_magnus_daily_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_magnus_daily_logs_updated ON public.magnus_daily_logs;
CREATE TRIGGER tr_magnus_daily_logs_updated
  BEFORE UPDATE ON public.magnus_daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_magnus_daily_logs_updated_at();

ALTER TABLE public.magnus_daily_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.magnus_daily_logs;
CREATE POLICY service_role_only ON public.magnus_daily_logs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.magnus_daily_logs IS
  'Free-form LifeOS / Magnus log lines (mirrors Notion daily log intent; used by memory + briefs).';
