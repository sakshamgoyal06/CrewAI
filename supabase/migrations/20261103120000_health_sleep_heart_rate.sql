-- Sleep and resting heart rate from Health Connect (Magnus Android app).
-- Safe to run more than once.
ALTER TABLE public.health_activity_samples DROP CONSTRAINT IF EXISTS health_activity_samples_kind_check;
ALTER TABLE public.health_activity_samples
  ADD CONSTRAINT health_activity_samples_kind_check
  CHECK (kind IN ('steps', 'distance', 'exercise', 'active_calories', 'sleep', 'resting_hr'));

ALTER TABLE public.health_daily_activity
  ADD COLUMN IF NOT EXISTS sleep_minutes INTEGER CHECK (sleep_minutes IS NULL OR (sleep_minutes >= 0 AND sleep_minutes <= 1440));
ALTER TABLE public.health_daily_activity
  ADD COLUMN IF NOT EXISTS resting_hr SMALLINT CHECK (resting_hr IS NULL OR (resting_hr >= 20 AND resting_hr <= 250));

COMMENT ON COLUMN public.health_daily_activity.sleep_minutes IS
  'Minutes asleep from Health Connect, credited to the day the person woke up. NULL when none synced.';
COMMENT ON COLUMN public.health_daily_activity.resting_hr IS
  'Lowest resting heart rate (bpm) Health Connect reported that day. NULL when none synced.';
