-- Per-user list catalog (Supabase canonical) with optional Notion mirror per list.
-- Any user gets standard list slugs; custom slugs allowed. Notion ids are per-user only.

CREATE TABLE IF NOT EXISTS public.magnus_user_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  display_name TEXT NOT NULL,
  archetype TEXT NOT NULL CHECK (
    archetype IN (
      'media_queue',
      'reading_queue',
      'place_queue',
      'food_queue',
      'music_queue',
      'task_queue',
      'goal_queue',
      'experience_queue',
      'pattern_log',
      'checkin_log',
      'generic_queue'
    )
  ),
  description TEXT,
  pillar TEXT,
  notion_data_source_id TEXT,
  notion_title_property TEXT NOT NULL DEFAULT 'Title',
  notion_status_property TEXT,
  notion_status_kind TEXT NOT NULL DEFAULT 'select' CHECK (notion_status_kind IN ('select', 'status')),
  default_status TEXT,
  open_statuses JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT magnus_user_lists_slug_unique UNIQUE (user_profile_id, slug),
  CONSTRAINT magnus_user_lists_slug_format CHECK (slug ~ '^[a-z][a-z0-9_-]{0,48}$')
);

CREATE INDEX IF NOT EXISTS idx_magnus_user_lists_user_active
  ON public.magnus_user_lists(user_profile_id)
  WHERE active = true;

CREATE TABLE IF NOT EXISTS public.magnus_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile(id) ON DELETE CASCADE,
  list_id UUID NOT NULL REFERENCES public.magnus_user_lists(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  status TEXT,
  notes TEXT,
  url TEXT,
  author TEXT,
  priority TEXT CHECK (priority IS NULL OR priority IN ('High', 'Medium', 'Low')),
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  notion_page_id TEXT,
  completed_at TIMESTAMPTZ,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_magnus_list_items_list_active
  ON public.magnus_list_items(list_id, updated_at DESC)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_magnus_list_items_user_list
  ON public.magnus_list_items(user_profile_id, list_id)
  WHERE is_deleted = false;

ALTER TABLE public.magnus_user_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.magnus_list_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.magnus_user_lists;
CREATE POLICY service_role_only ON public.magnus_user_lists
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_role_only ON public.magnus_list_items;
CREATE POLICY service_role_only ON public.magnus_list_items
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.magnus_user_lists IS
  'Per-user list definitions. Standard slugs ship for every user; custom slugs allowed. Notion mirror is optional per list.';
COMMENT ON TABLE public.magnus_list_items IS
  'Canonical list rows for Magnus. notion_page_id mirrors to the user''s Notion when configured.';
