-- LifeOS Notion database registry (collection ids + property hints for Magnus list tools).
ALTER TABLE public.user_integrations
  ADD COLUMN IF NOT EXISTS notion_registry JSONB;

COMMENT ON COLUMN public.user_integrations.notion_registry IS
  'Map of LifeOS list/database keys to Notion data source ids and title property names.';
