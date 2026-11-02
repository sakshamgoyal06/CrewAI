-- First-run interview answers on the health profile. The starting calorie target is computed from
-- these (src/healthApp/onboarding.ts) until there's enough logged data to adapt it.

ALTER TABLE public.user_health_profile
  ADD COLUMN IF NOT EXISTS sex TEXT CHECK (sex IN ('male', 'female')),
  ADD COLUMN IF NOT EXISTS birth_year INTEGER,
  ADD COLUMN IF NOT EXISTS height_cm NUMERIC,
  ADD COLUMN IF NOT EXISTS activity_level TEXT CHECK (activity_level IN ('desk', 'light', 'active')),
  ADD COLUMN IF NOT EXISTS diet TEXT CHECK (diet IN ('vegetarian', 'eggetarian', 'non_vegetarian', 'vegan', 'jain')),
  ADD COLUMN IF NOT EXISTS goal_type TEXT CHECK (goal_type IN ('lose', 'recomp', 'gain')),
  ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;
