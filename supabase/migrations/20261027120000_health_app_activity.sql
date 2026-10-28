-- Health PWA (phase 1): daily steps / walks, plus the targets the north-star metric scores against.
-- Steps arrive from outside the browser (iOS Shortcut, Health Auto Export, manual entry), one row per local day.

CREATE TABLE IF NOT EXISTS public.health_daily_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  local_date DATE NOT NULL,
  steps INTEGER NOT NULL DEFAULT 0 CHECK (steps >= 0),
  walk_minutes INTEGER CHECK (walk_minutes IS NULL OR walk_minutes >= 0),
  walk_distance_m INTEGER CHECK (walk_distance_m IS NULL OR walk_distance_m >= 0),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'ios_shortcut', 'health_auto_export', 'health_connect', 'api')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_health_daily_activity_user_date UNIQUE (user_profile_id, local_date)
);

CREATE INDEX IF NOT EXISTS idx_health_daily_activity_user_date
  ON public.health_daily_activity (user_profile_id, local_date DESC);

ALTER TABLE public.health_daily_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.health_daily_activity;
CREATE POLICY service_role_only ON public.health_daily_activity
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.health_daily_activity IS
  'One row per user per local day: steps and walks pushed by the health app ingest endpoint.';

ALTER TABLE public.user_health_profile ADD COLUMN IF NOT EXISTS daily_step_target INTEGER;
ALTER TABLE public.user_health_profile ADD COLUMN IF NOT EXISTS training_days SMALLINT[];

COMMENT ON COLUMN public.user_health_profile.daily_step_target IS 'Steps/day for an on-track day (health app north star).';
COMMENT ON COLUMN public.user_health_profile.training_days IS 'Weekdays with a planned workout, 0 = Sunday … 6 = Saturday.';

-- Outcome goal: body targets by a deadline. Daily consistency (north star) is scored separately.
CREATE TABLE IF NOT EXISTS public.health_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  target_weight_kg NUMERIC CHECK (target_weight_kg IS NULL OR target_weight_kg BETWEEN 25 AND 350),
  target_body_fat_pct NUMERIC CHECK (target_body_fat_pct IS NULL OR target_body_fat_pct BETWEEN 2 AND 70),
  target_muscle_mass_kg NUMERIC CHECK (target_muscle_mass_kg IS NULL OR target_muscle_mass_kg BETWEEN 10 AND 150),
  start_date DATE NOT NULL,
  deadline DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'achieved', 'replaced', 'abandoned')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_health_goals_dates CHECK (deadline > start_date)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_health_goals_one_active
  ON public.health_goals (user_profile_id) WHERE status = 'active';

ALTER TABLE public.health_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_only ON public.health_goals;
CREATE POLICY service_role_only ON public.health_goals
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Weekly body check-ins (smart scale or manual). One row per local day; latest write wins.
CREATE TABLE IF NOT EXISTS public.health_body_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  local_date DATE NOT NULL,
  weight_kg NUMERIC CHECK (weight_kg IS NULL OR weight_kg BETWEEN 25 AND 350),
  body_fat_pct NUMERIC CHECK (body_fat_pct IS NULL OR body_fat_pct BETWEEN 2 AND 70),
  muscle_mass_kg NUMERIC CHECK (muscle_mass_kg IS NULL OR muscle_mass_kg BETWEEN 10 AND 150),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_health_body_checkins_user_date UNIQUE (user_profile_id, local_date),
  CONSTRAINT chk_health_body_checkins_any CHECK (
    weight_kg IS NOT NULL OR body_fat_pct IS NOT NULL OR muscle_mass_kg IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_health_body_checkins_user_date
  ON public.health_body_checkins (user_profile_id, local_date DESC);

ALTER TABLE public.health_body_checkins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_only ON public.health_body_checkins;
CREATE POLICY service_role_only ON public.health_body_checkins
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Coach chat history for the app (user text, assistant text, and any cards it showed).
CREATE TABLE IF NOT EXISTS public.health_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  cards JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_health_chat_messages_user_created
  ON public.health_chat_messages (user_profile_id, created_at DESC);

ALTER TABLE public.health_chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_only ON public.health_chat_messages;
CREATE POLICY service_role_only ON public.health_chat_messages
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Raw activity buckets pushed from the phone (HC Webhook reading Android Health Connect).
-- Daily totals in health_daily_activity are rebuilt from these, so re-sent buckets never double count.
CREATE TABLE IF NOT EXISTS public.health_activity_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('steps', 'distance', 'exercise')),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  local_date DATE NOT NULL,
  value NUMERIC NOT NULL CHECK (value >= 0),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'health_connect',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_health_activity_samples UNIQUE (user_profile_id, kind, start_time)
);

CREATE INDEX IF NOT EXISTS idx_health_activity_samples_user_date
  ON public.health_activity_samples (user_profile_id, local_date);

ALTER TABLE public.health_activity_samples ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_only ON public.health_activity_samples;
CREATE POLICY service_role_only ON public.health_activity_samples
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
