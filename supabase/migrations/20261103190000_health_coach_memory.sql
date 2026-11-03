-- Coach memory: short lines the coach is asked to remember about the person (a schedule, an
-- injury, a food they can't stand). Shown on the You tab where the person edits or removes them.
-- Forgotten lines are kept with forgotten_at set so a turn's log can still be read.

CREATE TABLE IF NOT EXISTS public.health_coach_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  text TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 200),
  -- coach: the model called remember; person: typed on the You tab.
  source TEXT NOT NULL DEFAULT 'coach' CHECK (source IN ('coach', 'person')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  forgotten_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_health_coach_memory_user
  ON public.health_coach_memory (user_profile_id, created_at)
  WHERE forgotten_at IS NULL;

ALTER TABLE public.health_coach_memory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_only ON public.health_coach_memory;
CREATE POLICY service_role_only ON public.health_coach_memory
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
