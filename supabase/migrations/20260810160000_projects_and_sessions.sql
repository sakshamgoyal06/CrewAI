-- Projects + milestones + setup sessions for Magnus activity taxonomy.
-- Safe on existing hosted schema: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS.

-- ── projects ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  outcome TEXT NOT NULL,
  target_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  primary_pillar TEXT NOT NULL DEFAULT 'magnus',
  secondary_pillars TEXT[] DEFAULT '{}',
  goal_id UUID REFERENCES public.goals (id) ON DELETE SET NULL,
  priority_rank SMALLINT NOT NULL DEFAULT 1,
  energy_budget TEXT NOT NULL DEFAULT 'medium',
  north_star_note TEXT,
  checklist_list_id UUID REFERENCES public.magnus_user_lists (id) ON DELETE SET NULL,
  project_type TEXT NOT NULL DEFAULT 'custom',
  config JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Upgrade legacy Wisdom/build projects table (name, description, priority, …).
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS outcome TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS target_date DATE;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS primary_pillar TEXT DEFAULT 'magnus';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS secondary_pillars TEXT[] DEFAULT '{}';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS goal_id UUID;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS priority_rank SMALLINT DEFAULT 1;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS energy_budget TEXT DEFAULT 'medium';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS north_star_note TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS checklist_list_id UUID;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS project_type TEXT DEFAULT 'custom';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

UPDATE public.projects
SET
  title = COALESCE(title, name, 'Untitled project'),
  outcome = COALESCE(outcome, description, ''),
  priority_rank = COALESCE(priority_rank, priority, 1),
  primary_pillar = COALESCE(primary_pillar, 'magnus'),
  secondary_pillars = COALESCE(secondary_pillars, '{}'),
  energy_budget = COALESCE(energy_budget, 'medium'),
  project_type = COALESCE(project_type, 'custom'),
  config = COALESCE(config, '{}'::jsonb),
  metadata = COALESCE(metadata, '{}'::jsonb),
  status = COALESCE(status, 'active')
WHERE title IS NULL
   OR outcome IS NULL
   OR priority_rank IS NULL
   OR primary_pillar IS NULL
   OR secondary_pillars IS NULL
   OR energy_budget IS NULL
   OR project_type IS NULL
   OR config IS NULL
   OR metadata IS NULL
   OR status IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_goal_id_fkey'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_goal_id_fkey
      FOREIGN KEY (goal_id) REFERENCES public.goals (id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_checklist_list_id_fkey'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_checklist_list_id_fkey
      FOREIGN KEY (checklist_list_id) REFERENCES public.magnus_user_lists (id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.projects ALTER COLUMN title SET NOT NULL;
ALTER TABLE public.projects ALTER COLUMN outcome SET NOT NULL;
ALTER TABLE public.projects ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE public.projects ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.projects ALTER COLUMN primary_pillar SET NOT NULL;
ALTER TABLE public.projects ALTER COLUMN priority_rank SET NOT NULL;
ALTER TABLE public.projects ALTER COLUMN energy_budget SET NOT NULL;
ALTER TABLE public.projects ALTER COLUMN project_type SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_user_active
  ON public.projects (user_profile_id, status)
  WHERE is_deleted IS NOT TRUE AND status IN ('planning', 'active');

-- ── features (milestones) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID REFERENCES public.user_profile (id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  target_date DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  sort_order INTEGER DEFAULT 0,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.features ADD COLUMN IF NOT EXISTS target_date DATE;
ALTER TABLE public.features ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE public.features ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

UPDATE public.features
SET
  sort_order = COALESCE(sort_order, priority, 0),
  status = COALESCE(status, 'pending'),
  is_deleted = COALESCE(is_deleted, false)
WHERE sort_order IS NULL
   OR status IS NULL
   OR is_deleted IS NULL;

ALTER TABLE public.features ALTER COLUMN sort_order SET DEFAULT 0;
ALTER TABLE public.features ALTER COLUMN is_deleted SET DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_features_project
  ON public.features (project_id, sort_order)
  WHERE is_deleted IS NOT TRUE;

-- ── project_sessions (setup FSM) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID NOT NULL REFERENCES public.user_profile (id) ON DELETE CASCADE,
  project_type TEXT NOT NULL DEFAULT 'custom',
  status TEXT NOT NULL DEFAULT 'gathering',
  step TEXT NOT NULL DEFAULT 'intent',
  draft_title TEXT,
  draft_outcome TEXT,
  draft_target_date DATE,
  draft_checklist JSONB DEFAULT '[]'::jsonb,
  draft_milestones JSONB DEFAULT '[]'::jsonb,
  draft_config JSONB DEFAULT '{}'::jsonb,
  primary_pillar TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_sessions_user_active
  ON public.project_sessions (user_profile_id, updated_at DESC)
  WHERE status IN ('gathering', 'draft');

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.projects;
CREATE POLICY service_role_only ON public.projects
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_role_only ON public.features;
CREATE POLICY service_role_only ON public.features
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_role_only ON public.project_sessions;
CREATE POLICY service_role_only ON public.project_sessions
  FOR ALL USING (auth.role() = 'service_role');
