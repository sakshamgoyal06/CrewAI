-- Saved meal plan templates (reusable week/day structures).

CREATE TABLE IF NOT EXISTS public.meal_plan_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  day_count INTEGER NOT NULL DEFAULT 7 CHECK (day_count >= 1 AND day_count <= 14),
  slots TEXT[] NOT NULL DEFAULT '{breakfast,lunch,dinner}',
  entries JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_plan_template_user_name
  ON public.meal_plan_templates (user_profile_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_meal_plan_templates_user
  ON public.meal_plan_templates (user_profile_id, updated_at DESC);

ALTER TABLE public.meal_plan_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.meal_plan_templates;
CREATE POLICY service_role_only ON public.meal_plan_templates
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.meal_plan_templates IS
  'Reusable meal plan templates; entries use day_offset (0-based) + meal_slot.';
