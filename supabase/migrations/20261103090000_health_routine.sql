-- The person's weekly routine: several activities (morning walk, evening gym, swim on Tuesdays...),
-- each with its own days, time, length and reminder. Replaces the single gym slot; training days
-- are derived from it. Gym items keep the Hevy workout check (health_workout_checks); every other
-- item gets its own follow-up row in health_routine_checks.

CREATE TABLE IF NOT EXISTS public.health_routine_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  -- 'gym' (logged in Hevy) or an activity catalog key ('walking', 'swimming', 'football'...).
  activity_key TEXT NOT NULL,
  label TEXT NOT NULL,
  -- Weekdays, 0 = Sunday ... 6 = Saturday.
  days SMALLINT[] NOT NULL CHECK (cardinality(days) BETWEEN 1 AND 7),
  -- Local start time; null when they have no fixed time (no reminder, follow-up in the evening).
  start_time TIME,
  duration_min SMALLINT NOT NULL CHECK (duration_min BETWEEN 5 AND 600),
  -- Minutes before start to send the reminder; null = no reminder.
  remind_before_min SMALLINT CHECK (remind_before_min IS NULL OR remind_before_min BETWEEN 0 AND 180),
  -- Minutes after start to check it was done.
  check_after_min SMALLINT NOT NULL DEFAULT 120 CHECK (check_after_min BETWEEN 15 AND 720),
  position SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_health_routine_items_user
  ON public.health_routine_items (user_profile_id, position);

ALTER TABLE public.health_routine_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_only ON public.health_routine_items;
CREATE POLICY service_role_only ON public.health_routine_items
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- One row per non-gym routine item per day once its follow-up ran (or the person answered).
CREATE TABLE IF NOT EXISTS public.health_routine_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  -- No FK: the routine can be edited later, and past answers must survive that.
  item_id UUID NOT NULL,
  local_date DATE NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('done', 'missing', 'skipped')),
  reason TEXT,
  activity_id UUID,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ,
  CONSTRAINT uq_health_routine_checks UNIQUE (user_profile_id, item_id, local_date)
);

CREATE INDEX IF NOT EXISTS idx_health_routine_checks_user_date
  ON public.health_routine_checks (user_profile_id, local_date DESC);

ALTER TABLE public.health_routine_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_only ON public.health_routine_checks;
CREATE POLICY service_role_only ON public.health_routine_checks
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Carry over the existing gym slot as the first routine item, for anyone who has training days
-- and no routine yet.
INSERT INTO public.health_routine_items (user_profile_id, activity_key, label, days, start_time, duration_min, remind_before_min, check_after_min, position)
SELECT
  hp.user_profile_id,
  'gym',
  'Gym',
  hp.training_days::SMALLINT[],
  hp.gym_time,
  60,
  CASE WHEN hp.gym_time IS NULL THEN NULL ELSE 30 END,
  COALESCE(hp.workout_check_delay_min, 180),
  0
FROM public.user_health_profile hp
WHERE cardinality(hp.training_days) > 0
  AND NOT EXISTS (SELECT 1 FROM public.health_routine_items r WHERE r.user_profile_id = hp.user_profile_id);

COMMENT ON TABLE public.health_routine_items IS
  'Health app: the weekly routine (walks, gym, swims, sports) with times and reminders; drives training days, nudges and follow-ups.';
COMMENT ON TABLE public.health_routine_checks IS
  'Health app: follow-up result per non-gym routine item per day (done / missing / skipped + reason).';
