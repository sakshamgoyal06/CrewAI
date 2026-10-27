-- Health PWA (phase 1): daily steps / walks, plus the targets the north-star metric scores against.
-- Steps arrive from outside the browser (iOS Shortcut, Health Auto Export, manual entry), one row per local day.

CREATE TABLE IF NOT EXISTS public.health_daily_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  local_date DATE NOT NULL,
  steps INTEGER NOT NULL DEFAULT 0 CHECK (steps >= 0),
  walk_minutes INTEGER CHECK (walk_minutes IS NULL OR walk_minutes >= 0),
  walk_distance_m INTEGER CHECK (walk_distance_m IS NULL OR walk_distance_m >= 0),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'ios_shortcut', 'health_auto_export', 'health_connect', 'api')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_health_daily_activity_user_date UNIQUE (user_profile_id, local_date)
);

CREATE INDEX IF NOT EXISTS idx_health_daily_activity_user_date
  ON public.health_daily_activity (user_profile_id, local_date DESC);

ALTER TABLE public.health_daily_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.health_daily_activity;
CREATE POLICY service_role_only ON public.health_daily_activity
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.health_daily_activity IS
  'One row per user per local day: steps and walks pushed by the health app ingest endpoint.';

ALTER TABLE public.user_health_profile ADD COLUMN IF NOT EXISTS daily_step_target INTEGER;
ALTER TABLE public.user_health_profile ADD COLUMN IF NOT EXISTS training_days SMALLINT[];

COMMENT ON COLUMN public.user_health_profile.daily_step_target IS 'Steps/day for an on-track day (health app north star).';
COMMENT ON COLUMN public.user_health_profile.training_days IS 'Weekdays with a planned workout, 0 = Sunday … 6 = Saturday.';
