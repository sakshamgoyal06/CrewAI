-- Coach interventions: patterns the coach noticed, the changes it offered, and what happened.
-- Plan versions: every plan the person agreed to, so any earlier one can be restored.
-- See the PRD "Proactive coach interventions" (2026-11-03).

CREATE TABLE IF NOT EXISTS public.health_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  -- routine_slipping, routine_mismatch, calories_over, calories_under, protein_short, rebound,
  -- stalled, logging_fading, over_ambitious, deadline_drift, safety
  pattern TEXT NOT NULL,
  cause TEXT NOT NULL,
  -- One open offer or trial per area: "routine:<item id>", "nutrition", "goal", "logging".
  area TEXT NOT NULL,
  item_id TEXT,
  item_label TEXT,
  local_date DATE NOT NULL,
  title TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  facts JSONB NOT NULL DEFAULT '{}'::jsonb,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendation TEXT,
  status TEXT NOT NULL DEFAULT 'offered' CHECK (status IN (
    'offered',    -- card shown, no answer yet
    'kept',       -- "Keep as is": that pattern on that area stays quiet for 21 days
    'trial',      -- a change is running on top of the agreed plan
    'confirm',    -- the trial was checked; asking whether to make it the plan
    'confirmed',  -- saved as a new plan version
    'applied',    -- a change with nothing to trial (a new deadline), saved as a plan version
    'ended',      -- trial didn't help, or the person said no: back to the agreed plan
    'cancelled',  -- trial cancelled by the person
    'expired',    -- offer never answered
    'info'        -- a message with nothing to change (e.g. recomposition)
  )),
  chosen_option TEXT,
  -- What the trial changed: the live values before and after, to put back exactly.
  before JSONB,
  applied JSONB,
  -- Parts that wait for the person's yes (a new deadline).
  deferred JSONB,
  baseline JSONB,
  review_on DATE,
  verdict TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_health_interventions_user
  ON public.health_interventions (user_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_interventions_open
  ON public.health_interventions (user_profile_id, status)
  WHERE status IN ('offered', 'trial', 'confirm');

CREATE TABLE IF NOT EXISTS public.health_plan_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  -- { goal: {targets, startDate, deadline} | null, targets: {...}, routine: [...] }
  snapshot JSONB NOT NULL,
  reason TEXT NOT NULL,
  intervention_id UUID REFERENCES public.health_interventions (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_health_plan_versions UNIQUE (user_profile_id, version)
);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['health_interventions', 'health_plan_versions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS service_role_only ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY service_role_only ON public.%I FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')',
      t
    );
  END LOOP;
END $$;

COMMENT ON TABLE public.health_interventions IS
  'Health app: plan changes the coach offered after spotting a pattern, their trial and outcome.';
COMMENT ON TABLE public.health_plan_versions IS
  'Health app: every plan (goal, targets, routine) the person agreed to; any can be restored.';
