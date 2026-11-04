-- Water: one row per glass or bottle logged (from the Today tab or the coach). The day's total
-- is the sum; Undo deletes the latest row, so two quick taps never overwrite each other.
CREATE TABLE IF NOT EXISTS public.health_water_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  local_date DATE NOT NULL,
  ml INTEGER NOT NULL CHECK (ml BETWEEN 1 AND 3000),
  source TEXT NOT NULL DEFAULT 'quick_add' CHECK (source IN ('quick_add', 'chat')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_health_water_logs_user_date
  ON public.health_water_logs (user_profile_id, local_date DESC);

ALTER TABLE public.health_water_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_only ON public.health_water_logs;
CREATE POLICY service_role_only ON public.health_water_logs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
REVOKE ALL ON public.health_water_logs FROM anon, authenticated;

COMMENT ON TABLE public.health_water_logs IS 'Water drunk, one row per glass/bottle logged (health app). Day total = sum.';
