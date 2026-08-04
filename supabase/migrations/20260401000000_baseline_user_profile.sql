-- Baseline: core identity table (previously hosted-only).
-- Safe on existing projects: CREATE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS.
-- New installs: required before any feature migrations that FK to user_profile.

CREATE TABLE IF NOT EXISTS public.user_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  north_star_goal TEXT NOT NULL DEFAULT '',
  values JSONB,
  communication_style TEXT,
  wake_time TIME,
  sleep_time TIME,
  focus_hours JSONB,
  timezone TEXT DEFAULT 'UTC',
  telegram_chat_id TEXT UNIQUE,
  allowlisted BOOLEAN NOT NULL DEFAULT false,
  user_tier TEXT NOT NULL DEFAULT 'standard',
  access_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_profile_telegram_chat_id
  ON public.user_profile (telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;

ALTER TABLE public.user_profile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_only ON public.user_profile;
CREATE POLICY service_role_only ON public.user_profile
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.user_profile IS
  'Canonical user identity. Telegram id maps to telegram_chat_id; domain tables use user_profile_id.';
