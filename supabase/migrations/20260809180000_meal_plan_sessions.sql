-- Meal planning journey: multi-turn draft sessions before locking to meal_plan_entries.

CREATE TABLE IF NOT EXISTS public.meal_plan_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'gathering'
    CHECK (status IN ('gathering', 'draft', 'locked', 'abandoned')),
  step TEXT NOT NULL DEFAULT 'horizon'
    CHECK (step IN ('horizon', 'slots', 'constraints', 'review')),
  horizon_start DATE,
  horizon_end DATE,
  slots TEXT[] NOT NULL DEFAULT '{breakfast,lunch,dinner}',
  constraints_text TEXT,
  draft_entries JSONB NOT NULL DEFAULT '[]'::jsonb,
  draft_display TEXT,
  revision_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_plan_session_active
  ON public.meal_plan_sessions (user_profile_id)
  WHERE status IN ('gathering', 'draft');

CREATE INDEX IF NOT EXISTS idx_meal_plan_sessions_user_updated
  ON public.meal_plan_sessions (user_profile_id, updated_at DESC);

ALTER TABLE public.meal_plan_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.meal_plan_sessions;
CREATE POLICY service_role_only ON public.meal_plan_sessions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.meal_plan_sessions IS
  'In-progress meal planning conversations (draft until user locks the plan).';
