-- Pauses ("breaks"): one routine item, or the whole plan, paused for a reason up to a maximum
-- length (14 days for an item, 21 for the plan, 30 when sick or injured). Every scheduled job and
-- score reads these (src/healthApp/breaks.ts). Distinct from the account pause in accountStatus.ts.
CREATE TABLE IF NOT EXISTS public.health_breaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('item', 'plan')),
  item_id UUID,
  reason TEXT NOT NULL CHECK (reason IN ('sick', 'injured', 'travel', 'busy', 'rest', 'other')),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 200),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL CHECK (end_date >= start_date),
  ended_at TIMESTAMPTZ,
  -- The way back from a whole-plan pause (resume.ts): when they chose, and what.
  resumed_at TIMESTAMPTZ,
  resume_choice TEXT CHECK (resume_choice IS NULL OR resume_choice IN ('move_date', 'keep_date')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((scope = 'item') = (item_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_health_breaks_user
  ON public.health_breaks (user_profile_id, end_date DESC);

ALTER TABLE public.health_breaks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_only ON public.health_breaks;
CREATE POLICY service_role_only ON public.health_breaks
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
REVOKE ALL ON public.health_breaks FROM anon, authenticated;

COMMENT ON TABLE public.health_breaks IS 'Pauses of one routine item or the whole plan, with a reason and an end date; every job and score reads them.';
