-- LifeOS core domain tables (previously hosted-only).
-- Safe on existing projects: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS.
-- Full hardening (CHECK constraints, triggers): scripts/magnus_db_hardening.sql

-- ── goals ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID REFERENCES public.user_profile (id) ON DELETE CASCADE,
  pillar TEXT NOT NULL,
  timeframe TEXT NOT NULL DEFAULT 'weekly',
  title TEXT NOT NULL,
  description TEXT,
  target_date DATE,
  parent_goal_id UUID REFERENCES public.goals (id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active',
  priority INTEGER DEFAULT 1,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_goals_user_active
  ON public.goals (user_profile_id, status)
  WHERE is_deleted IS NOT TRUE;

-- ── pillar_status ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pillar_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID REFERENCES public.user_profile (id) ON DELETE CASCADE,
  pillar TEXT NOT NULL,
  date DATE NOT NULL,
  status TEXT NOT NULL,
  score DOUBLE PRECISION,
  kpis_green INTEGER DEFAULT 0,
  kpis_yellow INTEGER DEFAULT 0,
  kpis_red INTEGER DEFAULT 0,
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pillar_status_user_date
  ON public.pillar_status (user_profile_id, date DESC);

-- ── happiness_reserve (joy tank) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.happiness_reserve (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID REFERENCES public.user_profile (id) ON DELETE CASCADE,
  date DATE NOT NULL,
  level DOUBLE PRECISION NOT NULL,
  trend TEXT,
  self_reported_state TEXT,
  behavioural_state TEXT,
  gap_detected BOOLEAN DEFAULT false,
  gap_severity TEXT,
  streak_type TEXT,
  streak_days INTEGER DEFAULT 0,
  last_good_day DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_happiness_reserve_user_date
  ON public.happiness_reserve (user_profile_id, date DESC);

-- ── daily_plans ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID REFERENCES public.user_profile (id) ON DELETE CASCADE,
  date DATE NOT NULL,
  morning_intention TEXT,
  top_3_priorities JSONB,
  schedule JSONB,
  energy_allocation JSONB,
  generated_at TIMESTAMPTZ DEFAULT now(),
  reviewed_by_user BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_plans_user_date
  ON public.daily_plans (user_profile_id, date DESC);

-- ── kpi_definitions / kpi_readings ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kpi_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID REFERENCES public.user_profile (id) ON DELETE CASCADE,
  goal_id UUID REFERENCES public.goals (id) ON DELETE SET NULL,
  pillar TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT NOT NULL,
  direction TEXT NOT NULL,
  target_value DOUBLE PRECISION NOT NULL,
  warning_threshold DOUBLE PRECISION,
  critical_threshold DOUBLE PRECISION,
  measurement_freq TEXT DEFAULT 'daily',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.kpi_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID REFERENCES public.user_profile (id) ON DELETE CASCADE,
  kpi_id UUID REFERENCES public.kpi_definitions (id) ON DELETE SET NULL,
  date DATE NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  status TEXT,
  source TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kpi_readings_user_date
  ON public.kpi_readings (user_profile_id, date DESC);

-- ── magnus_insights ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.magnus_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID REFERENCES public.user_profile (id) ON DELETE CASCADE,
  pillar TEXT,
  insight_type TEXT,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_magnus_insights_user_created
  ON public.magnus_insights (user_profile_id, created_at DESC);

-- ── tasks (common LifeOS companion) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_profile_id UUID REFERENCES public.user_profile (id) ON DELETE CASCADE,
  goal_id UUID REFERENCES public.goals (id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  due_date DATE,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_status
  ON public.tasks (user_profile_id, status)
  WHERE is_deleted IS NOT TRUE;

-- RLS (idempotent)
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pillar_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.happiness_reserve ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.magnus_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.goals;
CREATE POLICY service_role_only ON public.goals
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_role_only ON public.pillar_status;
CREATE POLICY service_role_only ON public.pillar_status
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_role_only ON public.happiness_reserve;
CREATE POLICY service_role_only ON public.happiness_reserve
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_role_only ON public.daily_plans;
CREATE POLICY service_role_only ON public.daily_plans
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_role_only ON public.kpi_definitions;
CREATE POLICY service_role_only ON public.kpi_definitions
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_role_only ON public.kpi_readings;
CREATE POLICY service_role_only ON public.kpi_readings
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_role_only ON public.magnus_insights;
CREATE POLICY service_role_only ON public.magnus_insights
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS service_role_only ON public.tasks;
CREATE POLICY service_role_only ON public.tasks
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.goals IS 'LifeOS goals hierarchy — written by Magnus lifeos tools and add_goal dual-write.';
COMMENT ON TABLE public.happiness_reserve IS 'Joy tank / happiness reserve readings.';
COMMENT ON TABLE public.pillar_status IS 'Per-pillar daily status snapshots.';
