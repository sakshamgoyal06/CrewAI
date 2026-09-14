-- Meal logging from Magnus (Telegram); nutrition estimates from APIs or LLM.
-- RLS: server uses service role only.

CREATE TABLE IF NOT EXISTS public.meal_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  raw_text TEXT NOT NULL,
  calories NUMERIC,
  protein_g NUMERIC,
  carbs_g NUMERIC,
  fat_g NUMERIC,
  estimate_source TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  provider_raw JSONB,
  source_channel TEXT NOT NULL DEFAULT 'telegram',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_meal_logs_estimate_source CHECK (
    estimate_source IN (
      'healthifyme_proxy',
      'calorieninjas',
      'usda_fdc',
      'llm_estimate',
      'unavailable'
    )
  ),
  CONSTRAINT chk_meal_logs_source_channel CHECK (
    source_channel IN ('telegram', 'api', 'system')
  )
);

CREATE INDEX IF NOT EXISTS idx_meal_logs_user_created
  ON public.meal_logs (user_profile_id, created_at DESC);

ALTER TABLE public.meal_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.meal_logs;
CREATE POLICY service_role_only ON public.meal_logs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.meal_logs IS
  'User meal entries; free-text with API/LLM nutrition estimates (Magnus /meal commands).';
