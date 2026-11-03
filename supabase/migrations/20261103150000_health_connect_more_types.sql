-- More Health Connect data: total calories burned, heart rate variability, lean body mass.
-- Also (re)adds active_kcal, which magnus-ai never got from 20261101170000. Safe to run more than once.
ALTER TABLE public.health_activity_samples DROP CONSTRAINT IF EXISTS health_activity_samples_kind_check;
ALTER TABLE public.health_activity_samples
  ADD CONSTRAINT health_activity_samples_kind_check
  CHECK (kind IN ('steps', 'distance', 'exercise', 'active_calories', 'total_calories', 'sleep', 'resting_hr', 'hrv'));

ALTER TABLE public.health_daily_activity
  ADD COLUMN IF NOT EXISTS active_kcal INTEGER CHECK (active_kcal IS NULL OR active_kcal >= 0);
ALTER TABLE public.health_daily_activity
  ADD COLUMN IF NOT EXISTS total_kcal INTEGER CHECK (total_kcal IS NULL OR total_kcal >= 0);
ALTER TABLE public.health_daily_activity
  ADD COLUMN IF NOT EXISTS hrv_ms SMALLINT CHECK (hrv_ms IS NULL OR (hrv_ms > 0 AND hrv_ms <= 500));
ALTER TABLE public.health_body_checkins
  ADD COLUMN IF NOT EXISTS lean_mass_kg NUMERIC(5, 1) CHECK (lean_mass_kg IS NULL OR lean_mass_kg > 0);

COMMENT ON COLUMN public.health_daily_activity.active_kcal IS
  'Active calories burned that day, summed from Health Connect buckets. NULL when the phone sent none.';
COMMENT ON COLUMN public.health_daily_activity.total_kcal IS
  'Total calories burned that day incl. resting metabolism (Health Connect). NULL when none synced.';
COMMENT ON COLUMN public.health_daily_activity.hrv_ms IS
  'Average heart rate variability (RMSSD, ms) Health Connect reported that day. NULL when none synced.';
COMMENT ON COLUMN public.health_body_checkins.lean_mass_kg IS
  'Lean body mass from a Health Connect body-composition scale reading.';

-- Fill active_kcal for days already synced (the samples were stored, the day column was missing).
UPDATE public.health_daily_activity d
SET active_kcal = s.kcal
FROM (
  SELECT user_profile_id, local_date, ROUND(SUM(value))::int AS kcal
  FROM public.health_activity_samples
  WHERE kind = 'active_calories'
  GROUP BY user_profile_id, local_date
) s
WHERE d.user_profile_id = s.user_profile_id AND d.local_date = s.local_date AND d.active_kcal IS NULL;
