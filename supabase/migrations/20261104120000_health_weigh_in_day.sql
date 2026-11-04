-- The weekday someone weighs in on (0 = Sunday … 6 = Saturday). NULL keeps the old rule:
-- a weigh-in is due 7 days after the last one.

ALTER TABLE public.user_health_profile ADD COLUMN IF NOT EXISTS weigh_in_day SMALLINT
  CHECK (weigh_in_day BETWEEN 0 AND 6);

COMMENT ON COLUMN public.user_health_profile.weigh_in_day IS 'Weekday for the weekly weigh-in (0 = Sunday); NULL = 7 days after the last one (health app).';
