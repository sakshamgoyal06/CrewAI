-- Hevy changes the coach proposes (routine edits, new routines, workout logs). Nothing is written
-- to Hevy until the person applies the proposal, and what's applied is exactly the stored payload.
CREATE TABLE IF NOT EXISTS public.health_hevy_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('routine_update', 'routine_create', 'workout_log')),
  routine_id TEXT,
  title TEXT NOT NULL,
  reason TEXT,
  payload JSONB NOT NULL,
  summary JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applying', 'applied', 'discarded', 'failed')),
  hevy_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_health_hevy_proposals_user
  ON public.health_hevy_proposals (user_profile_id, created_at DESC);

ALTER TABLE public.health_hevy_proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_only ON public.health_hevy_proposals;
CREATE POLICY service_role_only ON public.health_hevy_proposals
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
