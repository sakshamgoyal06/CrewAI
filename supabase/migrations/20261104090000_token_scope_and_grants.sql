-- Device tokens get a scope: `ingest` tokens (the Android app, phone automations) may only send
-- data in; `full` is the signed-in person. Tokens made before this keep working as `full` until
-- the device reconnects; new tokens default to `ingest`.
ALTER TABLE public.health_app_tokens ADD COLUMN IF NOT EXISTS scope TEXT;
UPDATE public.health_app_tokens SET scope = 'full' WHERE scope IS NULL;
ALTER TABLE public.health_app_tokens ALTER COLUMN scope SET DEFAULT 'ingest';
ALTER TABLE public.health_app_tokens ALTER COLUMN scope SET NOT NULL;
ALTER TABLE public.health_app_tokens DROP CONSTRAINT IF EXISTS health_app_tokens_scope_check;
ALTER TABLE public.health_app_tokens ADD CONSTRAINT health_app_tokens_scope_check CHECK (scope IN ('full', 'ingest'));

-- Defence in depth: RLS already denies the browser roles, but they shouldn't hold table grants
-- either. Only the server (service role) talks to these tables; the app uses Supabase for sign-in only.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t.tablename);
  END LOOP;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
