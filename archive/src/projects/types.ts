/**
 * Project types — activity taxonomy layer.
 */
export type ProjectStatus = "planning" | "active" | "paused" | "completed" | "abandoned";
export type ProjectEnergyBudget = "high" | "medium" | "low";
export type ProjectSessionStatus = "gathering" | "draft" | "locked" | "abandoned";
export type ProjectSessionStep = "intent" | "scope" | "checklist" | "milestones" | "review";

export type ProjectRow = {
  id: string;
  user_profile_id: string;
  title: string;
  outcome: string;
  target_date: string | null;
  status: ProjectStatus;
  primary_pillar: string;
  secondary_pillars: string[];
  goal_id: string | null;
  priority_rank: number;
  energy_budget: ProjectEnergyBudget;
  north_star_note: string | null;
  checklist_list_id: string | null;
  project_type: string;
  config: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type FeatureRow = {
  id: string;
  project_id: string;
  title: string;
  target_date: string | null;
  status: string;
  sort_order: number;
};

export type ProjectSessionRow = {
  id: string;
  user_profile_id: string;
  project_type: string;
  status: ProjectSessionStatus;
  step: ProjectSessionStep;
  draft_title: string | null;
  draft_outcome: string | null;
  draft_target_date: string | null;
  draft_checklist: string[];
  draft_milestones: string[];
  draft_config: Record<string, unknown>;
  primary_pillar: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ActiveProjectSummary = {
  id: string;
  title: string;
  outcome: string;
  target_date: string | null;
  status: ProjectStatus;
  project_type: string;
  primary_pillar: string;
  priority_rank: number;
  energy_budget: ProjectEnergyBudget;
  open_checklist_count?: number;
  next_checklist_item?: string;
};

export const MAX_ACTIVE_PROJECTS = 3;
