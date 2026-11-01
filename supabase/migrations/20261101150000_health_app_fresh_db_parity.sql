-- Health app on a fresh Supabase project: bring the tables it shares with the old bot
-- (meal_logs, user_health_profile, meal_daily_rollups, meal_plan_entries, user_integrations)
-- to the shape src/healthApp and src/nutrition expect.
--
-- The old hosted project got these from the 20260412*/20260802*/20260809* migrations plus
-- hosted-only LifeOS columns on meal_logs (date, meal_time, description, macros, logged_at)
-- that no migration in this repo creates. A fresh project that only ran the baseline + the
-- 20261027–20261101 health migrations is missing all of it, and meal logging fails.
--
-- Additive and idempotent: safe to run on the old project too.

-- meal_logs: legacy LifeOS columns the app still writes
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS meal_time TEXT NOT NULL DEFAULT 'unspecified';
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS macros JSONB;
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS logged_at TIMESTAMPTZ DEFAULT now();

-- meal_logs: Magnus columns (20260412190000, 20260412210000, 20260809140000)
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS raw_text TEXT;
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS protein_g NUMERIC;
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS carbs_g NUMERIC;
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS fat_g NUMERIC;
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS estimate_source TEXT;
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS provider_raw JSONB;
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS source_channel TEXT NOT NULL DEFAULT 'api';
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS meal_session_id UUID;
UPDATE public.meal_logs SET meal_session_id = gen_random_uuid() WHERE meal_session_id IS NULL;
ALTER TABLE public.meal_logs ALTER COLUMN meal_session_id SET NOT NULL;
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS component_index INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS local_date DATE;
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS meal_slot TEXT;
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS log_kind TEXT NOT NULL DEFAULT 'meal';
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.meal_logs DROP CONSTRAINT IF EXISTS chk_meal_logs_estimate_source;
ALTER TABLE public.meal_logs ADD CONSTRAINT chk_meal_logs_estimate_source CHECK (
  estimate_source IS NULL OR estimate_source IN (
    'healthifyme_proxy', 'calorieninjas', 'usda_fdc', 'llm_estimate', 'unavailable', 'web_research'
  )
);
ALTER TABLE public.meal_logs DROP CONSTRAINT IF EXISTS chk_meal_logs_source_channel;
ALTER TABLE public.meal_logs ADD CONSTRAINT chk_meal_logs_source_channel CHECK (
  source_channel IN ('telegram', 'api', 'system')
);
ALTER TABLE public.meal_logs DROP CONSTRAINT IF EXISTS chk_meal_logs_meal_slot;
ALTER TABLE public.meal_logs ADD CONSTRAINT chk_meal_logs_meal_slot CHECK (
  meal_slot IS NULL OR meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack', 'unspecified')
);
ALTER TABLE public.meal_logs DROP CONSTRAINT IF EXISTS chk_meal_logs_log_kind;
ALTER TABLE public.meal_logs ADD CONSTRAINT chk_meal_logs_log_kind CHECK (
  log_kind IN ('meal', 'snack', 'drink', 'supplement', 'correction')
);

CREATE INDEX IF NOT EXISTS idx_meal_logs_user_session
  ON public.meal_logs (user_profile_id, meal_session_id);
CREATE INDEX IF NOT EXISTS idx_meal_logs_user_local_date
  ON public.meal_logs (user_profile_id, local_date)
  WHERE deleted_at IS NULL;

-- user_health_profile: macro targets (20260412210000, 20260809140000)
ALTER TABLE public.user_health_profile ADD COLUMN IF NOT EXISTS daily_calorie_target INTEGER;
ALTER TABLE public.user_health_profile ADD COLUMN IF NOT EXISTS daily_protein_g_target NUMERIC;
ALTER TABLE public.user_health_profile ADD COLUMN IF NOT EXISTS daily_carbs_g_target NUMERIC;
ALTER TABLE public.user_health_profile ADD COLUMN IF NOT EXISTS daily_fat_g_target NUMERIC;
ALTER TABLE public.user_health_profile ADD COLUMN IF NOT EXISTS macro_targets_set_at TIMESTAMPTZ;
ALTER TABLE public.user_health_profile DROP CONSTRAINT IF EXISTS user_health_profile_next_question_check;
ALTER TABLE public.user_health_profile ADD CONSTRAINT user_health_profile_next_question_check
  CHECK (next_question IN ('fitness', 'diet', 'timing', 'restrictions', 'targets', 'done'));

-- meal_daily_rollups (20260809140000 + 20260809160000)
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
ALTER TABLE public.meal_daily_rollups ADD COLUMN IF NOT EXISTS slots_planned TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.meal_daily_rollups ADD COLUMN IF NOT EXISTS slots_missed TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.meal_daily_rollups ADD COLUMN IF NOT EXISTS adherence_score NUMERIC;
CREATE INDEX IF NOT EXISTS idx_meal_daily_rollups_user_date
  ON public.meal_daily_rollups (user_profile_id, local_date DESC);

-- meal_plan_entries (20260809160000); rollups read planned slots from it
CREATE TABLE IF NOT EXISTS public.meal_plan_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  local_date DATE NOT NULL,
  meal_slot TEXT NOT NULL CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack')),
  title TEXT NOT NULL,
  description TEXT,
  estimated_calories NUMERIC,
  estimated_protein_g NUMERIC,
  estimated_carbs_g NUMERIC,
  estimated_fat_g NUMERIC,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'logged', 'skipped', 'swapped', 'partial')),
  linked_meal_session_id UUID,
  source TEXT NOT NULL DEFAULT 'chat'
    CHECK (source IN ('chat', 'template', 'copied', 'auto')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meal_plan_user_date
  ON public.meal_plan_entries (user_profile_id, local_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_plan_active_slot
  ON public.meal_plan_entries (user_profile_id, local_date, meal_slot)
  WHERE status IN ('planned', 'logged', 'partial');
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS plan_entry_id UUID
  REFERENCES public.meal_plan_entries (id) ON DELETE SET NULL;

-- user_integrations: per-user Hevy key (env HEVY_API_KEY is the fallback). All columns the
-- loader selects must exist or the whole lookup errors.
CREATE TABLE IF NOT EXISTS public.user_integrations (
  user_profile_id UUID PRIMARY KEY REFERENCES public.user_profile (id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_integrations
  ADD COLUMN IF NOT EXISTS google_calendar_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS google_youtube_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS hevy_api_key TEXT,
  ADD COLUMN IF NOT EXISTS kite_api_key TEXT,
  ADD COLUMN IF NOT EXISTS kite_api_secret TEXT,
  ADD COLUMN IF NOT EXISTS kite_access_token TEXT,
  ADD COLUMN IF NOT EXISTS kite_user_id TEXT,
  ADD COLUMN IF NOT EXISTS kite_token_obtained_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notion_token TEXT,
  ADD COLUMN IF NOT EXISTS notion_daily_log_parent_page_id TEXT,
  ADD COLUMN IF NOT EXISTS notion_morning_brief_parent_page_id TEXT,
  ADD COLUMN IF NOT EXISTS notion_goals_database_id TEXT,
  ADD COLUMN IF NOT EXISTS notion_daily_checkins_database_id TEXT,
  ADD COLUMN IF NOT EXISTS notion_registry JSONB;

-- Service role only, like every other Magnus table
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['meal_logs', 'meal_daily_rollups', 'meal_plan_entries', 'user_integrations'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS service_role_only ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY service_role_only ON public.%I FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')',
      t
    );
  END LOOP;
END $$;

-- Security advisor 0011: pin the trigger function's search_path
DO $$
BEGIN
  IF to_regprocedure('public.set_user_health_profile_updated_at()') IS NOT NULL THEN
    ALTER FUNCTION public.set_user_health_profile_updated_at() SET search_path = '';
  END IF;
END $$;
