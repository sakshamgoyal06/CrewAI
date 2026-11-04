-- Calories burned from Health Connect (HC Webhook "active_calories"), for the tracker's burn chart.
ALTER TABLE public.health_activity_samples DROP CONSTRAINT IF EXISTS health_activity_samples_kind_check;
ALTER TABLE public.health_activity_samples
  ADD CONSTRAINT health_activity_samples_kind_check
  CHECK (kind IN ('steps', 'distance', 'exercise', 'active_calories'));

ALTER TABLE public.health_daily_activity
  ADD COLUMN IF NOT EXISTS active_kcal INTEGER CHECK (active_kcal IS NULL OR active_kcal >= 0);

COMMENT ON COLUMN public.health_daily_activity.active_kcal IS
  'Active calories burned that day, summed from Health Connect buckets. NULL when the phone sent none.';
