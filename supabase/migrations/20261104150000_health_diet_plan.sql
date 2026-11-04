-- Diet plan (plan doc https://claude.ai/artifact/2hkp25L1E3hpigQjuiSFFk, 2026-11-04).
-- Setup answers, plan versions with their 5-8 options per meal, and day-close carry-overs.
-- Each day's picks live in the existing meal_plan_entries (one row per date and meal).

CREATE TABLE IF NOT EXISTS public.health_diet_preferences (
  user_profile_id UUID PRIMARY KEY REFERENCES public.user_profile (id) ON DELETE CASCADE,
  -- meals (slot, time, share, cookMinutes), restrictions, fastingDays, loves, whoCooks, kitchen, staples, eatOut
  prefs JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Option ids; they are stable across rebuilds, so these survive a new plan version.
  pinned_options TEXT[] NOT NULL DEFAULT '{}',
  liked_options TEXT[] NOT NULL DEFAULT '{}',
  hidden_options TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.health_diet_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  version INTEGER NOT NULL,
  -- { calories, proteinG, fatG, carbsG, fiberG }
  targets JSONB NOT NULL,
  -- [{ slot, share, calories, proteinG, carbsG, fatG }]
  budgets JSONB NOT NULL,
  -- setup, prefs_changed, target_change, rebuild, intervention, chat
  reason TEXT NOT NULL,
  replaces_id UUID REFERENCES public.health_diet_plans (id) ON DELETE SET NULL,
  -- Model review result: { model, at, issues: [...] } or null when the review is off.
  review JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_health_diet_plans_version UNIQUE (user_profile_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_health_diet_plans_active
  ON public.health_diet_plans (user_profile_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.health_diet_plan_options (
  plan_id UUID NOT NULL REFERENCES public.health_diet_plans (id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  slot TEXT NOT NULL CHECK (slot IN ('breakfast', 'lunch', 'snack', 'dinner')),
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  -- [{ key, name, servingId, qty, text, grams, kcal, proteinG, carbsG, fatG, fiberG }]
  items JSONB NOT NULL,
  totals JSONB NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('usual', 'catalog')),
  usual_key TEXT,
  prep_minutes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (plan_id, id)
);

CREATE INDEX IF NOT EXISTS idx_health_diet_plan_options_user
  ON public.health_diet_plan_options (user_profile_id, plan_id, slot, position);

-- Calorie changes the day close spreads over the next days (never protein, never below the floor).
CREATE TABLE IF NOT EXISTS public.health_diet_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  local_date DATE NOT NULL,
  kcal_delta INTEGER NOT NULL,
  -- The day whose miss this spreads.
  source_date DATE NOT NULL,
  reason TEXT NOT NULL DEFAULT 'day_close',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_health_diet_adjustments UNIQUE (user_profile_id, local_date, source_date)
);

-- Picks made by the diet plan are source 'plan'.
ALTER TABLE public.meal_plan_entries DROP CONSTRAINT IF EXISTS meal_plan_entries_source_check;
ALTER TABLE public.meal_plan_entries ADD CONSTRAINT meal_plan_entries_source_check
  CHECK (source IN ('chat', 'template', 'copied', 'auto', 'plan'));

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['health_diet_preferences', 'health_diet_plans', 'health_diet_plan_options', 'health_diet_adjustments'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS service_role_only ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY service_role_only ON public.%I FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')',
      t
    );
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

COMMENT ON TABLE public.health_diet_preferences IS 'Diet plan setup answers and option pins, likes and hides.';
COMMENT ON TABLE public.health_diet_plans IS 'Diet plan versions: targets, meal budgets, one active per person.';
COMMENT ON TABLE public.health_diet_plan_options IS 'The 5-8 options per meal in a diet plan version.';
COMMENT ON TABLE public.health_diet_adjustments IS 'Day-close calorie carry-overs onto the next days.';
