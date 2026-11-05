-- Foods a person found with "Can't find it? Search" (web lookup) or typed in from a label, saved
-- once they approve them so the food searches offer them next time. A typed-in food ('own') is
-- private to that person; an approved web food ('web') is offered to everyone.
-- A lookup's results are stored unapproved first (approved = false) so the approve call can only
-- save what the lookup itself returned; unapproved rows older than a day are deleted.
CREATE TABLE IF NOT EXISTS public.health_my_foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  lookup_id UUID,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  food_key TEXT NOT NULL,
  calories INTEGER NOT NULL CHECK (calories BETWEEN 1 AND 3000),
  protein_g NUMERIC(6, 1) NOT NULL DEFAULT 0 CHECK (protein_g BETWEEN 0 AND 300),
  carbs_g NUMERIC(6, 1) NOT NULL DEFAULT 0 CHECK (carbs_g BETWEEN 0 AND 500),
  fat_g NUMERIC(6, 1) NOT NULL DEFAULT 0 CHECK (fat_g BETWEEN 0 AND 300),
  source TEXT NOT NULL CHECK (source IN ('web', 'own')),
  approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_health_my_foods_user
  ON public.health_my_foods (user_profile_id, approved, approved_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_my_foods_shared
  ON public.health_my_foods (approved, source, approved_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_my_foods_lookup
  ON public.health_my_foods (user_profile_id, lookup_id);

ALTER TABLE public.health_my_foods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_only ON public.health_my_foods;
CREATE POLICY service_role_only ON public.health_my_foods
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
REVOKE ALL ON public.health_my_foods FROM anon, authenticated;

COMMENT ON TABLE public.health_my_foods IS 'Foods approved from web search (offered to everyone) or typed in (private to that person); shown in the food searches.';
