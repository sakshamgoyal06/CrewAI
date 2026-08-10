/**
 * Project persistence — projects + milestones (features).
 */
import { logger } from "../logger.js";
import { supabase } from "../tools/clients.js";
import { loggableError } from "../util/loggableError.js";
import type {
  ActiveProjectSummary,
  FeatureRow,
  ProjectEnergyBudget,
  ProjectRow,
  ProjectStatus,
} from "./types.js";
import { MAX_ACTIVE_PROJECTS } from "./types.js";

function isTableMissing(msg: string): boolean {
  return (
    msg.includes("projects") ||
    msg.includes("features") ||
    msg.includes("schema cache") ||
    msg.includes("does not exist")
  );
}

function normalizeProject(row: Record<string, unknown>): ProjectRow {
  return {
    ...(row as ProjectRow),
    secondary_pillars: Array.isArray(row.secondary_pillars)
      ? (row.secondary_pillars as string[])
      : [],
    config:
      row.config && typeof row.config === "object" && !Array.isArray(row.config)
        ? (row.config as Record<string, unknown>)
        : {},
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
  };
}

export async function listActiveProjects(userProfileId: string): Promise<ProjectRow[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_profile_id", userProfileId)
    .in("status", ["planning", "active"])
    .eq("is_deleted", false)
    .order("priority_rank", { ascending: true })
    .limit(MAX_ACTIVE_PROJECTS + 2);

  if (error) {
    if (isTableMissing(error.message)) {
      return [];
    }
    logger.warn({ err: loggableError(error), userProfileId }, "projects list failed");
    return [];
  }

  return (data ?? []).map((r) => normalizeProject(r as Record<string, unknown>));
}

export async function getProjectById(
  userProfileId: string,
  projectId: string,
): Promise<ProjectRow | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_profile_id", userProfileId)
    .eq("id", projectId)
    .eq("is_deleted", false)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return normalizeProject(data as Record<string, unknown>);
}

export async function countActiveProjects(userProfileId: string): Promise<number> {
  const rows = await listActiveProjects(userProfileId);
  return rows.filter((r) => r.status === "active").length;
}

export async function createProject(input: {
  userProfileId: string;
  title: string;
  outcome: string;
  targetDate?: string | null;
  status?: ProjectStatus;
  primaryPillar: string;
  secondaryPillars?: string[];
  goalId?: string | null;
  priorityRank?: number;
  energyBudget?: ProjectEnergyBudget;
  northStarNote?: string | null;
  checklistListId?: string | null;
  projectType?: string;
  config?: Record<string, unknown>;
}): Promise<{ ok: true; project: ProjectRow } | { ok: false; error: string }> {
  const activeCount = await countActiveProjects(input.userProfileId);
  if (activeCount >= MAX_ACTIVE_PROJECTS && (input.status ?? "active") === "active") {
    return {
      ok: false,
      error: `You already have ${MAX_ACTIVE_PROJECTS} active projects. Pause or complete one first.`,
    };
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_profile_id: input.userProfileId,
      title: input.title,
      outcome: input.outcome,
      target_date: input.targetDate ?? null,
      status: input.status ?? "active",
      primary_pillar: input.primaryPillar,
      secondary_pillars: input.secondaryPillars ?? [],
      goal_id: input.goalId ?? null,
      priority_rank: input.priorityRank ?? activeCount + 1,
      energy_budget: input.energyBudget ?? "medium",
      north_star_note: input.northStarNote ?? null,
      checklist_list_id: input.checklistListId ?? null,
      project_type: input.projectType ?? "custom",
      config: input.config ?? {},
    })
    .select("*")
    .single();

  if (error) {
    if (isTableMissing(error.message)) {
      return { ok: false, error: "projects table missing — apply migration" };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true, project: normalizeProject(data as Record<string, unknown>) };
}

export async function updateProject(
  projectId: string,
  patch: Partial<{
    title: string;
    outcome: string;
    target_date: string | null;
    status: ProjectStatus;
    priority_rank: number;
    energy_budget: ProjectEnergyBudget;
    north_star_note: string | null;
    checklist_list_id: string | null;
    config: Record<string, unknown>;
    metadata: Record<string, unknown>;
  }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) {
      payload[k] = v;
    }
  }

  const { error } = await supabase.from("projects").update(payload).eq("id", projectId);
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function createProjectMilestones(
  userProfileId: string,
  projectId: string,
  titles: string[],
): Promise<{ ok: true; features: FeatureRow[] } | { ok: false; error: string }> {
  if (titles.length === 0) {
    return { ok: true, features: [] };
  }

  const rows = titles.map((title, i) => ({
    user_profile_id: userProfileId,
    project_id: projectId,
    title,
    status: "pending",
    sort_order: i,
  }));

  const { data, error } = await supabase.from("features").insert(rows).select("*");
  if (error) {
    if (isTableMissing(error.message)) {
      return { ok: false, error: "features table missing — apply migration" };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true, features: (data ?? []) as FeatureRow[] };
}

export async function listProjectMilestones(projectId: string): Promise<FeatureRow[]> {
  const { data, error } = await supabase
    .from("features")
    .select("*")
    .eq("project_id", projectId)
    .eq("is_deleted", false)
    .order("sort_order", { ascending: true });

  if (error) {
    return [];
  }
  return (data ?? []) as FeatureRow[];
}

export function formatActiveProjectsForMemory(projects: ActiveProjectSummary[]): string {
  if (projects.length === 0) {
    return "";
  }
  const lines = projects.map((p, i) => {
    const pri = p.priority_rank === 1 ? "primary" : "secondary";
    const due = p.target_date ? ` due ${p.target_date}` : "";
    const next = p.next_checklist_item
      ? ` — next: "${p.next_checklist_item}"`
      : p.open_checklist_count
        ? ` — ${p.open_checklist_count} open checklist item(s)`
        : "";
    return `${i + 1}. [${pri}] ${p.title} (${p.project_type})${due}${next}`;
  });
  return `Active projects (${projects.length}):\n${lines.join("\n")}`;
}
