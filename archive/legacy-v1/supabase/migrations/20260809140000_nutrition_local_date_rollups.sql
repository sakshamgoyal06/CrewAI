-- Nutrition phase 0/1: local-date meal logs, soft delete, daily rollups, optional targets step.

-- meal_logs enrichments
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS local_date DATE;
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS meal_slot TEXT;
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS log_kind TEXT NOT NULL DEFAULT 'meal';
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_meal_logs_meal_slot'
  ) THEN
    ALTER TABLE public.meal_logs ADD CONSTRAINT chk_meal_logs_meal_slot CHECK (
      meal_slot IS NULL OR meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack', 'unspecified')
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_meal_logs_log_kind'
  ) THEN
    ALTER TABLE public.meal_logs ADD CONSTRAINT chk_meal_logs_log_kind CHECK (
      log_kind IN ('meal', 'snack', 'drink', 'supplement', 'correction')
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_meal_logs_user_local_date
  ON public.meal_logs (user_profile_id, local_date)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.meal_logs.local_date IS 'Calendar date in user timezone when the meal was logged.';
COMMENT ON COLUMN public.meal_logs.meal_slot IS 'breakfast | lunch | dinner | snack | unspecified';
COMMENT ON COLUMN public.meal_logs.deleted_at IS 'Soft delete — row kept for analytics integrity.';

-- Backfill local_date from legacy date column where possible
UPDATE public.meal_logs
SET local_date = date
WHERE local_date IS NULL AND date IS NOT NULL;

UPDATE public.meal_logs
SET local_date = (created_at AT TIME ZONE 'UTC')::date
WHERE local_date IS NULL AND created_at IS NOT NULL;

UPDATE public.meal_logs
SET meal_slot = 'unspecified'
WHERE meal_slot IS NULL;

-- Daily rollups for fast reads, brief, and anomaly detection
CREATE TABLE IF NOT EXISTS public.meal_daily_rollups (
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  local_date DATE NOT NULL,
  calories NUMERIC NOT NULL DEFAULT 0,
  protein_g NUMERIC NOT NULL DEFAULT 0,
  carbs_g NUMERIC NOT NULL DEFAULT 0,
  fat_g NUMERIC NOT NULL DEFAULT 0,
  meal_count INTEGER NOT NULL DEFAULT 0,
  snack_count INTEGER NOT NULL DEFAULT 0,
  slots_logged TEXT[] NOT NULL DEFAULT '{}',
  target_calories NUMERIC,
  target_protein_g NUMERIC,
  flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_profile_id, local_date)
);

CREATE INDEX IF NOT EXISTS idx_meal_daily_rollups_user_date
  ON public.meal_daily_rollups (user_profile_id, local_date DESC);

ALTER TABLE public.meal_daily_rollups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.meal_daily_rollups;
CREATE POLICY service_role_only ON public.meal_daily_rollups
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.meal_daily_rollups IS
  'Pre-aggregated daily nutrition totals per user local date.';

-- Optional macro-target onboarding step + timestamp
ALTER TABLE public.user_health_profile ADD COLUMN IF NOT EXISTS macro_targets_set_at TIMESTAMPTZ;

ALTER TABLE public.user_health_profile DROP CONSTRAINT IF EXISTS user_health_profile_next_question_check;

ALTER TABLE public.user_health_profile ADD CONSTRAINT user_health_profile_next_question_check
  CHECK (next_question IN ('fitness', 'diet', 'timing', 'restrictions', 'targets', 'done'));

COMMENT ON COLUMN public.user_health_profile.macro_targets_set_at IS
  'When daily macro targets were last set (onboarding or explicit update).';
