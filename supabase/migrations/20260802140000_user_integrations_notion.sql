-- Per-user Notion credentials and database targets (platform keeps OAuth app ids only).

ALTER TABLE public.user_integrations
  ADD COLUMN IF NOT EXISTS notion_token TEXT,
  ADD COLUMN IF NOT EXISTS notion_goals_database_id TEXT,
  ADD COLUMN IF NOT EXISTS notion_daily_checkins_database_id TEXT;

COMMENT ON COLUMN public.user_integrations.notion_token IS
  'Notion integration token for this user''s workspace.';
COMMENT ON COLUMN public.user_integrations.notion_goals_database_id IS
  'Optional LifeOS goals database id for morning brief / agents.';
COMMENT ON COLUMN public.user_integrations.notion_daily_checkins_database_id IS
  'Optional LifeOS daily check-ins database id for morning brief / agents.';
