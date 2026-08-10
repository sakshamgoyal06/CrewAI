-- Projects + milestones + setup sessions for Magnus activity taxonomy.
-- Safe on existing projects: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS.

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
