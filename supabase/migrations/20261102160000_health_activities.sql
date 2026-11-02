-- Activities outside Hevy (swimming, running, sports, yoga...), so the day's calories burned is complete.
-- Logged from chat or the tracker, or picked up from Health Connect exercise sessions.
CREATE TABLE IF NOT EXISTS public.health_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  local_date DATE NOT NULL,
  start_time TIMESTAMPTZ,
  duration_min INTEGER NOT NULL CHECK (duration_min BETWEEN 1 AND 1440),
  activity_key TEXT NOT NULL,
  label TEXT NOT NULL,
  intensity TEXT NOT NULL DEFAULT 'moderate' CHECK (intensity IN ('easy', 'moderate', 'hard')),
  distance_m INTEGER CHECK (distance_m IS NULL OR distance_m >= 0),
  kcal INTEGER NOT NULL CHECK (kcal >= 0),
  kcal_source TEXT NOT NULL CHECK (kcal_source IN ('device', 'user', 'estimate')),
  met NUMERIC,
  source TEXT NOT NULL CHECK (source IN ('chat', 'quick_add', 'health_connect')),
  -- Health Connect session start, so re-synced sessions are recognised.
  external_id TEXT,
  -- The client's draft id, so saving the same card twice logs once.
  draft_id TEXT,
  -- Logged as its own session even though a Health Connect session matched it.
  separate_session BOOLEAN NOT NULL DEFAULT false,
  -- Set when a Health Connect session covers this entry; it then isn't counted.
  duplicate_of UUID REFERENCES public.health_activities (id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_health_activities_external UNIQUE (user_profile_id, source, external_id),
  CONSTRAINT uq_health_activities_draft UNIQUE (user_profile_id, draft_id)
);

CREATE INDEX IF NOT EXISTS idx_health_activities_user_date
  ON public.health_activities (user_profile_id, local_date DESC);

ALTER TABLE public.health_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_only ON public.health_activities;
CREATE POLICY service_role_only ON public.health_activities
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.health_activities IS
  'Non-Hevy activities (swim, run, sports...) with an active-kcal estimate; feeds the tracker''s calories burned.';
