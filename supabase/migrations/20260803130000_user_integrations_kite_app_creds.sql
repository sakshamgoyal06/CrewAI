-- Per-user Kite Connect app credentials (like hevy_api_key). Env vars are owner fallback for scripts.

ALTER TABLE public.user_integrations
  ADD COLUMN IF NOT EXISTS kite_api_key TEXT,
  ADD COLUMN IF NOT EXISTS kite_api_secret TEXT;

COMMENT ON COLUMN public.user_integrations.kite_api_key IS
  'Kite Connect app API key from developers.kite.trade — per user, not on the host.';
COMMENT ON COLUMN public.user_integrations.kite_api_secret IS
  'Kite Connect app API secret — per user; never set on Railway.';
