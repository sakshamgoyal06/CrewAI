/**
 * Project setup session store — multi-turn FSM before lock.
 */
import { logger } from "../logger.js";
import { supabase } from "../tools/clients.js";
import { loggableError } from "../util/loggableError.js";
import type { ProjectSessionRow, ProjectSessionStatus, ProjectSessionStep } from "./types.js";

function isTableMissing(msg: string): boolean {
  return msg.includes("project_sessions") || msg.includes("does not exist");
}

function normalizeChecklist(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function normalizeSession(row: Record<string, unknown>): ProjectSessionRow {
  return {
    ...(row as ProjectSessionRow),
    draft_checklist: normalizeChecklist(row.draft_checklist),
    draft_milestones: normalizeChecklist(row.draft_milestones),
    draft_config:
      row.draft_config && typeof row.draft_config === "object"
        ? (row.draft_config as Record<string, unknown>)
        : {},
  };
}

export async function getActiveProjectSession(
  userProfileId: string,
): Promise<ProjectSessionRow | null> {
  const { data, error } = await supabase
    .from("project_sessions")
    .select("*")
    .eq("user_profile_id", userProfileId)
    .in("status", ["gathering", "draft"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isTableMissing(error.message)) {
      return null;
    }
    logger.warn({ err: loggableError(error), userProfileId }, "project session select failed");
    return null;
  }
  if (!data) {
    return null;
  }
  return normalizeSession(data as Record<string, unknown>);
}

export async function createProjectSession(
  userProfileId: string,
  projectType: string,
): Promise<{ ok: true; session: ProjectSessionRow } | { ok: false; error: string }> {
  const existing = await getActiveProjectSession(userProfileId);
  if (existing) {
    return { ok: true, session: existing };
  }

  const { data, error } = await supabase
    .from("project_sessions")
    .insert({
      user_profile_id: userProfileId,
      project_type: projectType,
      status: "gathering",
      step: "intent",
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    if (isTableMissing(error.message)) {
      return { ok: false, error: "project_sessions table missing — apply migration" };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true, session: normalizeSession(data as Record<string, unknown>) };
}

export async function updateProjectSession(
  userProfileId: string,
  sessionId: string,
  patch: Partial<{
    status: ProjectSessionStatus;
    step: ProjectSessionStep;
    draft_title: string | null;
    draft_outcome: string | null;
    draft_target_date: string | null;
    draft_checklist: string[];
    draft_milestones: string[];
    draft_config: Record<string, unknown>;
    primary_pillar: string | null;
    project_type: string;
  }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) {
      payload[k] = v;
    }
  }

  const { error } = await supabase
    .from("project_sessions")
    .update(payload)
    .eq("id", sessionId)
    .eq("user_profile_id", userProfileId);
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function abandonProjectSession(
  userProfileId: string,
  sessionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return updateProjectSession(userProfileId, sessionId, { status: "abandoned", step: "intent" });
}

export async function lockProjectSession(
  userProfileId: string,
  sessionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return updateProjectSession(userProfileId, sessionId, { status: "locked", step: "review" });
}
