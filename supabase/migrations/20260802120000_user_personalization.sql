-- Per-user personalization: display name, program memory, integrations.
-- Core Magnus behaviour stays in code; this holds user-driven context only.

ALTER TABLE public.user_profile
  ADD COLUMN IF NOT EXISTS display_name TEXT;

COMMENT ON COLUMN public.user_profile.display_name IS
  'How Magnus may address the user. Null = use "you" only.';

-- Health / program memory sections (replaces shared files on disk for multi-user).
CREATE TABLE IF NOT EXISTS public.user_program_memory (
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_profile_id, section),
  CONSTRAINT user_program_memory_section_check CHECK (
    section IN (
      'user_context',
      'weekly_schedule',
      'program_learnings',
      'recovery_routine'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_user_program_memory_user
  ON public.user_program_memory (user_profile_id);

ALTER TABLE public.user_program_memory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_only ON public.user_program_memory;
CREATE POLICY service_role_only ON public.user_program_memory
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Per-user integration credentials (calendar, Hevy, etc.). Env vars remain owner fallback.
CREATE TABLE IF NOT EXISTS public.user_integrations (
  user_profile_id UUID PRIMARY KEY REFERENCES public.user_profile (id) ON DELETE CASCADE,
  google_calendar_refresh_token TEXT,
  hevy_api_key TEXT,
  notion_daily_log_parent_page_id TEXT,
  notion_morning_brief_parent_page_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_only ON public.user_integrations;
CREATE POLICY service_role_only ON public.user_integrations
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
