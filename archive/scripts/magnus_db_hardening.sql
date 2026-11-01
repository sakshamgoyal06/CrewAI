-- Magnus production hardening (reference copy; applied via Supabase migration)
-- Project: xdrpjfdhduskhzryevze

-- 0) Data cleanup for CHECK constraints (safe defaults)
UPDATE goals SET status = 'active' WHERE status IS NULL;
UPDATE tasks SET status = 'pending' WHERE status IS NULL;
UPDATE tasks SET priority = 'medium' WHERE priority IS NULL;
UPDATE kpi_readings SET status = 'yellow' WHERE status IS NULL;
UPDATE pillar_status SET status = 'at_risk' WHERE status IS NULL;
UPDATE happiness_reserve SET streak_type = 'neutral' WHERE streak_type IS NULL;
UPDATE happiness_activities SET energy_required = 'medium' WHERE energy_required IS NULL;

-- 1) updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2) created_at on every table missing it
ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE agent_computations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE budget_categories ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE computation_dependencies ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE daily_plans ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE deviations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE energy_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE happiness_activities ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE kpi_definitions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE learning_digest ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE magnus_insights ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE meal_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE meal_plans ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE occasions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE weekly_reviews ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE watchlist ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Backfill user_profile.created_at from updated_at where null
UPDATE user_profile SET created_at = COALESCE(created_at, updated_at, now()) WHERE created_at IS NULL;

-- 3) updated_at columns + triggers for required tables
ALTER TABLE user_profile ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE features ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE learning_goals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE magnus_mode ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE happiness_activities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

UPDATE features SET updated_at = COALESCE(updated_at, created_at, now()) WHERE updated_at IS NULL;
UPDATE learning_goals SET updated_at = COALESCE(updated_at, created_at, now()) WHERE updated_at IS NULL;
UPDATE magnus_mode SET updated_at = COALESCE(updated_at, created_at, now()) WHERE updated_at IS NULL;
UPDATE happiness_activities SET updated_at = COALESCE(updated_at, added_at, created_at, now()) WHERE updated_at IS NULL;

DROP TRIGGER IF EXISTS set_updated_at ON user_profile;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON user_profile
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON goals;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON goals
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON tasks;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON contacts;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON contacts
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON projects;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON features;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON features
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON happiness_activities;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON happiness_activities
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON learning_goals;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON learning_goals
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON magnus_mode;
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON magnus_mode
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 4) Foreign keys — drop and recreate with explicit ON DELETE
ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS activity_logs_activity_id_fkey;
ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_activity_id_fkey
  FOREIGN KEY (activity_id) REFERENCES happiness_activities(id) ON DELETE CASCADE;

ALTER TABLE features DROP CONSTRAINT IF EXISTS features_project_id_fkey;
ALTER TABLE features ADD CONSTRAINT features_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_parent_goal_id_fkey;
ALTER TABLE goals ADD CONSTRAINT goals_parent_goal_id_fkey
  FOREIGN KEY (parent_goal_id) REFERENCES goals(id) ON DELETE CASCADE;

ALTER TABLE interventions DROP CONSTRAINT IF EXISTS interventions_deviation_id_fkey;
ALTER TABLE interventions ADD CONSTRAINT interventions_deviation_id_fkey
  FOREIGN KEY (deviation_id) REFERENCES deviations(id) ON DELETE CASCADE;

ALTER TABLE kpi_definitions DROP CONSTRAINT IF EXISTS kpi_definitions_goal_id_fkey;
ALTER TABLE kpi_definitions ADD CONSTRAINT kpi_definitions_goal_id_fkey
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE;

ALTER TABLE kpi_readings DROP CONSTRAINT IF EXISTS kpi_readings_kpi_id_fkey;
ALTER TABLE kpi_readings ADD CONSTRAINT kpi_readings_kpi_id_fkey
  FOREIGN KEY (kpi_id) REFERENCES kpi_definitions(id) ON DELETE SET NULL;

ALTER TABLE learning_logs DROP CONSTRAINT IF EXISTS learning_logs_learning_goal_id_fkey;
ALTER TABLE learning_logs ADD CONSTRAINT learning_logs_learning_goal_id_fkey
  FOREIGN KEY (learning_goal_id) REFERENCES learning_goals(id) ON DELETE CASCADE;

ALTER TABLE occasions DROP CONSTRAINT IF EXISTS occasions_contact_id_fkey;
ALTER TABLE occasions ADD CONSTRAINT occasions_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE relationship_logs DROP CONSTRAINT IF EXISTS relationship_logs_contact_id_fkey;
ALTER TABLE relationship_logs ADD CONSTRAINT relationship_logs_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_goal_id_fkey;
ALTER TABLE tasks ADD CONSTRAINT tasks_goal_id_fkey
  FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE SET NULL;

-- 5) CHECK constraints (idempotent via DO blocks)
DO $$ BEGIN
  ALTER TABLE goals ADD CONSTRAINT chk_goals_pillar CHECK (pillar IN ('health','wealth','build','relationships','learning','life','happiness'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE goals ADD CONSTRAINT chk_goals_timeframe CHECK (timeframe IN ('north_star','annual','quarterly','monthly','weekly'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE goals ADD CONSTRAINT chk_goals_status CHECK (status IN ('active','completed','paused','dropped'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE kpi_definitions ADD CONSTRAINT chk_kpi_definitions_direction CHECK (direction IN ('higher_better','lower_better','target_exact'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE kpi_readings ADD CONSTRAINT chk_kpi_readings_status CHECK (status IN ('green','yellow','red'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE pillar_status ADD CONSTRAINT chk_pillar_status_status CHECK (status IN ('on_track','at_risk','deviating'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE deviations ADD CONSTRAINT chk_deviations_severity CHECK (severity IN ('minor','moderate','major','critical'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE deviations ADD CONSTRAINT chk_deviations_type CHECK (type IN ('single_kpi','full_pillar','cross_pillar','north_star'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT chk_tasks_status CHECK (status IN ('pending','in_progress','done','snoozed','dropped'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT chk_tasks_priority CHECK (priority IN ('high','medium','low'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE happiness_reserve ADD CONSTRAINT chk_happiness_reserve_streak_type CHECK (streak_type IN ('good_streak','neutral','rough_patch'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE magnus_mode ADD CONSTRAINT chk_magnus_mode_mode CHECK (mode IN ('normal','good_streak','rough_patch','intervention'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE happiness_activities ADD CONSTRAINT chk_happiness_activities_energy_required CHECK (energy_required IS NULL OR energy_required IN ('low','medium','high'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE workouts ADD CONSTRAINT chk_workouts_type CHECK (type IN ('legs','push','pull','cardio','swimming','rest','upper','lower','full_body'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 6) RLS + blanket policy (anon/authenticated blocked; service_role bypasses RLS in Supabase)
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS service_role_only ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY service_role_only ON public.%I FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')',
      t
    );
  END LOOP;
END $$;

-- 7) Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_status_due_date ON tasks(status, due_date);
CREATE INDEX IF NOT EXISTS idx_expenses_date_category ON expenses(date, category_id);
CREATE INDEX IF NOT EXISTS idx_trades_date_symbol ON trades(date, symbol);

-- 8) Unique constraints — already enforced by existing unique indexes (Phase 1 audit)

-- 9) Soft delete
ALTER TABLE goals ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE happiness_activities ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_goals_not_deleted ON goals(is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_tasks_not_deleted ON tasks(is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_contacts_not_deleted ON contacts(is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_projects_not_deleted ON projects(is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_happiness_activities_not_deleted ON happiness_activities(is_deleted) WHERE is_deleted = FALSE;
