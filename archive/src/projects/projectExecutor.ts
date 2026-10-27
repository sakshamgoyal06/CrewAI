/**
 * Project capabilities — setup, manage, status, goals.
 */
import type { AgentContext, AgentResult } from "../agents/types.js";
import { lifeosAddGoal } from "../lifeos/lifeosTool.js";
import { queryListItems } from "../lists/listStore.js";
import { supabase } from "../tools/clients.js";
import {
  formatActiveProjectsForMemory,
  getProjectById,
  listActiveProjects,
  listProjectMilestones,
  updateProject,
} from "./projectStore.js";
import { runProjectSetupFlow } from "./projectSetupFlow.js";
import type { ActiveProjectSummary } from "./types.js";

async function checklistSummary(
  userProfileId: string,
  checklistListId: string | null,
): Promise<{ open: number; next?: string }> {
  if (!checklistListId) {
    return { open: 0 };
  }
  const { data: list } = await supabase
    .from("magnus_user_lists")
    .select("id, slug")
    .eq("id", checklistListId)
    .maybeSingle();
  if (!list?.slug) {
    return { open: 0 };
  }

  const items = await queryListItems({
    userProfileId,
    listId: checklistListId,
    openStatuses: ["Open", "In progress", "open", "pending"],
    limit: 20,
  });
  if (!items.ok) {
    return { open: 0 };
  }
  const open = items.data.length;
  const next = items.data[0]?.title;
  return { open, next };
}

export async function buildActiveProjectSummaries(
  userProfileId: string,
): Promise<ActiveProjectSummary[]> {
  const projects = await listActiveProjects(userProfileId);
  const summaries: ActiveProjectSummary[] = [];
  for (const p of projects) {
    const { open, next } = await checklistSummary(userProfileId, p.checklist_list_id);
    summaries.push({
      id: p.id,
      title: p.title,
      outcome: p.outcome,
      target_date: p.target_date,
      status: p.status,
      project_type: p.project_type,
      primary_pillar: p.primary_pillar,
      priority_rank: p.priority_rank,
      energy_budget: p.energy_budget,
      open_checklist_count: open,
      next_checklist_item: next,
    });
  }
  return summaries;
}

export async function runProjectStatus(ctx: AgentContext): Promise<AgentResult> {
  const summaries = await buildActiveProjectSummaries(ctx.userProfileId);
  if (summaries.length === 0) {
    return {
      text: "You don't have any active projects right now. Tell me what you're working toward and I'll set one up.",
      metadata: { specialist: "Magnus", project_status: true, pillar_compose: true },
    };
  }

  const blocks: string[] = [];
  for (const s of summaries) {
    const milestones = await listProjectMilestones(ctx.userProfileId, s.id);
    const doneMs = milestones.filter((m) => m.status === "done").length;
    blocks.push(
      [
        `**${s.title}** (${s.project_type})`,
        `Done when: ${s.outcome}`,
        s.target_date ? `Deadline: ${s.target_date}` : "",
        s.open_checklist_count
          ? `${s.open_checklist_count} open checklist item(s)${s.next_checklist_item ? ` — next: ${s.next_checklist_item}` : ""}`
          : "Checklist clear",
        milestones.length > 0 ? `Milestones: ${doneMs}/${milestones.length} done` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return {
    text: blocks.join("\n\n"),
    metadata: { specialist: "Magnus", project_status: true, pillar_compose: true },
  };
}

export async function runProjectManage(ctx: AgentContext, args: Record<string, unknown>): Promise<AgentResult> {
  const raw = ctx.rawMessage.trim().toLowerCase();
  const projectId = typeof args.project_id === "string" ? args.project_id : undefined;

  let project = projectId
    ? await getProjectById(ctx.userProfileId, projectId)
    : (await listActiveProjects(ctx.userProfileId))[0] ?? null;

  if (!project) {
    return {
      text: "Which project should I update? Name it or start one first.",
      metadata: { specialist: "Magnus", project_manage: true },
    };
  }

  if (/\b(?:pause|hold|freeze)\b/.test(raw)) {
    await updateProject(ctx.userProfileId, project.id, { status: "paused" });
    return {
      text: `Paused **${project.title}**. Checklist nudges are off until you resume.`,
      metadata: { specialist: "Magnus", project_id: project.id, pillar_compose: true },
    };
  }

  if (/\b(?:resume|unpause|continue)\b/.test(raw)) {
    await updateProject(ctx.userProfileId, project.id, { status: "active" });
    return {
      text: `Resumed **${project.title}**.`,
      metadata: { specialist: "Magnus", project_id: project.id, pillar_compose: true },
    };
  }

  if (/\b(?:complete|done|finished|we did it)\b/.test(raw)) {
    await updateProject(ctx.userProfileId, project.id, { status: "completed" });
    return {
      text: `Marked **${project.title}** complete. Nice work.`,
      metadata: { specialist: "Magnus", project_id: project.id, pillar_compose: true },
    };
  }

  if (/\b(?:drop|abandon|cancel project)\b/.test(raw)) {
    await updateProject(ctx.userProfileId, project.id, { status: "abandoned" });
    return {
      text: `Dropped **${project.title}**.`,
      metadata: { specialist: "Magnus", project_id: project.id, pillar_compose: true },
    };
  }

  if (/\b(?:primary|priorit)\b/.test(raw)) {
    await updateProject(ctx.userProfileId, project.id, { priority_rank: 1, energy_budget: "high" });
    const others = (await listActiveProjects(ctx.userProfileId)).filter((p) => p.id !== project.id);
    for (const o of others) {
      await updateProject(ctx.userProfileId, o.id, { priority_rank: o.priority_rank + 1, energy_budget: "medium" });
    }
    return {
      text: `Made **${project.title}** your primary project for now.`,
      metadata: { specialist: "Magnus", project_id: project.id, pillar_compose: true },
    };
  }

  return runProjectStatus(ctx);
}

export async function runGoalManage(ctx: AgentContext): Promise<AgentResult> {
  const raw = ctx.rawMessage.trim();
  const titleMatch = raw.match(/\b(?:goal|add goal|set goal)\s*[:\-]?\s*(.+)/i);
  const title = titleMatch?.[1]?.trim() ?? raw.slice(0, 120);
  if (!title || title.length < 3) {
    return {
      text: "What goal should I save? e.g. 'Goal: BMI under 25 by December'",
      metadata: { specialist: "Magnus", goal_manage: true },
    };
  }

  const result = await lifeosAddGoal({
    userProfileId: ctx.userProfileId,
    title,
    timeframe: "annual",
    status: "active",
  });

  return {
    text: result,
    metadata: { specialist: "Magnus", goal_manage: true, pillar_compose: true },
  };
}

export async function executeProjectCapability(
  ctx: AgentContext,
  capability: string,
  args: Record<string, unknown>,
): Promise<AgentResult> {
  switch (capability) {
    case "project_setup":
      return runProjectSetupFlow(ctx);
    case "project_manage":
      return runProjectManage(ctx, args);
    case "project_status":
      return runProjectStatus(ctx);
    case "goal_manage":
      return runGoalManage(ctx);
    default:
      return runProjectStatus(ctx);
  }
}

export function formatProjectsMemoryBlock(summaries: ActiveProjectSummary[]): string {
  return formatActiveProjectsForMemory(summaries);
}
