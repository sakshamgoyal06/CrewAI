-- Gym slot on training days, and the automatic "did you log your workout?" check after it.

ALTER TABLE public.user_health_profile ADD COLUMN IF NOT EXISTS gym_time TIME;
ALTER TABLE public.user_health_profile ADD COLUMN IF NOT EXISTS workout_check_delay_min SMALLINT
  NOT NULL DEFAULT 180 CHECK (workout_check_delay_min BETWEEN 30 AND 720);

COMMENT ON COLUMN public.user_health_profile.gym_time IS 'Local start time of the gym slot on training days (health app).';
COMMENT ON COLUMN public.user_health_profile.workout_check_delay_min IS 'Minutes after gym_time to check Hevy for a logged workout.';

-- One row per training day once the check has run. The user's answer (skipped + reason) feeds RCA.
CREATE TABLE IF NOT EXISTS public.health_workout_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  local_date DATE NOT NULL,
  gym_time TIME NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('found', 'missing', 'skipped', 'trained_unlogged')),
  hevy_workout_id TEXT,
  reason TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ,
  CONSTRAINT uq_health_workout_checks UNIQUE (user_profile_id, local_date)
);

ALTER TABLE public.health_workout_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_only ON public.health_workout_checks;
CREATE POLICY service_role_only ON public.health_workout_checks
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
