-- Structured health preferences + onboarding state (LifeOS / Magnus Health composite).
-- Service role only (same pattern as other Magnus tables).

CREATE TABLE IF NOT EXISTS public.user_health_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL UNIQUE REFERENCES public.user_profile (id) ON DELETE CASCADE,
  onboarding_completed_at TIMESTAMPTZ,
  next_question TEXT NOT NULL DEFAULT 'fitness'
    CHECK (next_question IN ('fitness', 'diet', 'timing', 'restrictions', 'done')),
  fitness_goals TEXT,
  diet_preferences TEXT,
  meal_timing_notes TEXT,
  dietary_restrictions TEXT,
  notes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_health_profile_user
  ON public.user_health_profile (user_profile_id);

CREATE OR REPLACE FUNCTION public.set_user_health_profile_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_user_health_profile_updated ON public.user_health_profile;
CREATE TRIGGER tr_user_health_profile_updated
  BEFORE UPDATE ON public.user_health_profile
  FOR EACH ROW EXECUTE FUNCTION public.set_user_health_profile_updated_at();

ALTER TABLE public.user_health_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.user_health_profile;
CREATE POLICY service_role_only ON public.user_health_profile
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.user_health_profile IS
  'Health onboarding + durable preferences (fitness goals, diet, timing, restrictions) for Magnus Health agents.';
