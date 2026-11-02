-- Accounts for the health app: a Supabase Auth user (Google sign-in) maps to one user_profile,
-- and personal API tokens let a phone automation (Health Connect webhook) post for one user.
-- The server keeps using the service role and scopes every query by user_profile_id.

ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE,
  ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN public.user_profile.auth_user_id IS 'auth.users id of the Google account that signs in as this profile.';

CREATE TABLE IF NOT EXISTS public.health_app_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  -- sha256 hex of the token; the token itself is shown once and never stored.
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT 'Health Connect',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_health_app_tokens_user ON public.health_app_tokens (user_profile_id);

COMMENT ON TABLE public.health_app_tokens IS 'Personal API tokens for phone automations (hashed).';

ALTER TABLE public.health_app_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_only ON public.health_app_tokens;
CREATE POLICY service_role_only ON public.health_app_tokens FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
REVOKE ALL ON public.health_app_tokens FROM anon, authenticated;
