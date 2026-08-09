-- Nutrition phase 2: persisted meal plans + plan-log linking + rollup adherence.

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

ALTER TABLE public.meal_plan_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.meal_plan_entries;
CREATE POLICY service_role_only ON public.meal_plan_entries
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.meal_plan_entries IS
  'Persisted meal plan slots per user local date (Magnus Health nutrition).';

ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS plan_entry_id UUID
  REFERENCES public.meal_plan_entries (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.meal_logs.plan_entry_id IS
  'Linked meal_plan_entries row when log matched a planned slot.';

-- Rollup adherence columns (phase 2)
ALTER TABLE public.meal_daily_rollups ADD COLUMN IF NOT EXISTS slots_planned TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.meal_daily_rollups ADD COLUMN IF NOT EXISTS slots_missed TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.meal_daily_rollups ADD COLUMN IF NOT EXISTS adherence_score NUMERIC;

COMMENT ON COLUMN public.meal_daily_rollups.adherence_score IS
  '0–1 ratio of planned slots logged for the day.';
