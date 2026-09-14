-- Per-user Kite Connect (Zerodha) access token. Platform holds KITE_API_KEY/SECRET on the host.

ALTER TABLE public.user_integrations
  ADD COLUMN IF NOT EXISTS kite_access_token TEXT,
  ADD COLUMN IF NOT EXISTS kite_user_id TEXT,
  ADD COLUMN IF NOT EXISTS kite_token_obtained_at TIMESTAMPTZ;

COMMENT ON COLUMN public.user_integrations.kite_access_token IS
  'Kite Connect access token (expires daily ~6 AM IST). OAuth via /oauth/kite/callback.';
COMMENT ON COLUMN public.user_integrations.kite_user_id IS
  'Zerodha client id from Kite profile after connect.';
COMMENT ON COLUMN public.user_integrations.kite_token_obtained_at IS
  'When the current kite_access_token was issued.';
