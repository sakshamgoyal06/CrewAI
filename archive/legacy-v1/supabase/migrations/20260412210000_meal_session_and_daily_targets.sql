-- Group rows that belong to one /meal command; optional daily macro targets for 🟢/🔴.

ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS meal_session_id UUID;
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS component_index INTEGER NOT NULL DEFAULT 0;

UPDATE public.meal_logs SET meal_session_id = gen_random_uuid() WHERE meal_session_id IS NULL;

ALTER TABLE public.meal_logs ALTER COLUMN meal_session_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meal_logs_user_session
  ON public.meal_logs (user_profile_id, meal_session_id);

COMMENT ON COLUMN public.meal_logs.meal_session_id IS 'Shared by all components logged in one /meal command.';
COMMENT ON COLUMN public.meal_logs.component_index IS '0-based order of components within meal_session_id.';

ALTER TABLE public.user_health_profile ADD COLUMN IF NOT EXISTS daily_calorie_target INTEGER;
ALTER TABLE public.user_health_profile ADD COLUMN IF NOT EXISTS daily_protein_g_target NUMERIC;
ALTER TABLE public.user_health_profile ADD COLUMN IF NOT EXISTS daily_carbs_g_target NUMERIC;
ALTER TABLE public.user_health_profile ADD COLUMN IF NOT EXISTS daily_fat_g_target NUMERIC;

COMMENT ON COLUMN public.user_health_profile.daily_calorie_target IS 'Upper bound kcal/day (🟢 when day total ≤ this).';
COMMENT ON COLUMN public.user_health_profile.daily_protein_g_target IS 'Lower bound g/day (🟢 when day total ≥ this).';
COMMENT ON COLUMN public.user_health_profile.daily_carbs_g_target IS 'Upper bound g/day (🟢 when day total ≤ this).';
COMMENT ON COLUMN public.user_health_profile.daily_fat_g_target IS 'Upper bound g/day (🟢 when day total ≤ this).';
