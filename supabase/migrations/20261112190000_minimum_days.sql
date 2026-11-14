-- Minimum days ("bad day" mode, batch 3 of "make the goal inevitable"): on a rough day the person
-- switches to a minimum day. A protein anchor (half the protein target) plus a steps floor
-- (5,000, or the step target if lower) keeps the day, labelled minimum. At most 2 in any 7 days.
-- Run in the magnus-ai SQL editor. Additive and safe: one new table. The app works without it
-- (no minimum days) until it exists.
CREATE TABLE IF NOT EXISTS public.health_minimum_days (
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  local_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_profile_id, local_date)
);

ALTER TABLE public.health_minimum_days ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_only ON public.health_minimum_days;
CREATE POLICY service_role_only ON public.health_minimum_days
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
REVOKE ALL ON public.health_minimum_days FROM anon, authenticated;

COMMENT ON TABLE public.health_minimum_days IS 'Days the person chose a minimum day: a protein anchor and a steps floor keep the day (northStar.ts minimumScore).';
