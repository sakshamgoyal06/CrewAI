/**
 * Multi-turn project setup: intent → scope → checklist → milestones → review → lock.
 * Turn actions parsed by LLM (parseProjectSetupTurn) — not regex.
 */
import type { AgentContext, AgentResult } from "../agents/types.js";
import { createCustomList } from "../lists/listService.js";
import { fetchListBySlug } from "../lists/listStore.js";
import { insertListItem } from "../lists/listStore.js";
import { getProjectTheme } from "./themes/index.js";
import {
  createProject,
  createProjectMilestones,
  updateProject,
} from "./projectStore.js";
import {
  abandonProjectSession,
  createProjectSession,
  getActiveProjectSession,
  lockProjectSession,
  updateProjectSession,
} from "./projectSessionStore.js";
import type { ProjectSessionRow } from "./types.js";
import {
  parseProjectSetupTurn,
  projectSetupIntentActionable,
  type ParsedProjectSetupTurn,
} from "./parseProjectSetupTurn.js";

function formatDraftReview(session: ProjectSessionRow, themeLabel: string): string {
  const lines = [
    `**${session.draft_title ?? themeLabel}**`,
    session.draft_outcome ? `Done when: ${session.draft_outcome}` : "",
    session.draft_target_date ? `Deadline: ${session.draft_target_date}` : "",
    "",
    "**Checklist:**",
    ...(session.draft_checklist.length > 0
      ? session.draft_checklist.map((c: string) => `• ${c}`)
      : ["• (none yet)"]),
    "",
    "**Milestones:**",
    ...(session.draft_milestones.length > 0
      ? session.draft_milestones.map((m: string) => `• ${m}`)
      : ["• (none yet)"]),
    "",
    "Tell me when to **lock it in**, what to change, or that you want to **cancel**.",
  ];
  return lines.filter(Boolean).join("\n");
}

async function seedChecklistList(
  userProfileId: string,
  projectId: string,
  title: string,
  items: string[],
): Promise<string | null> {
  const slug = `project-${projectId.slice(0, 8)}-checklist`;
  await createCustomList({
    userProfileId,
    slug,
    displayName: `${title} checklist`,
    archetype: "task_queue",
    description: "Project checklist",
  });

  const listResult = await fetchListBySlug(userProfileId, slug);
  if (!listResult.ok || !listResult.data) {
    return null;
  }

  const listId = listResult.data.id;
  for (const item of items) {
    await insertListItem({
      userProfileId,
      listId,
      title: item,
      status: "Open",
      extra: { project_id: projectId },
    });
  }
  return listId;
}

async function lockSessionToProject(
  ctx: AgentContext,
  session: ProjectSessionRow,
): Promise<AgentResult> {
  const theme = getProjectTheme(session.project_type);
  const title = session.draft_title?.trim() || theme.label;
  const outcome = session.draft_outcome?.trim() || theme.defaultOutcomePrompt;
  const pillar = session.primary_pillar ?? theme.primaryPillar.toLowerCase();

  const created = await createProject({
    userProfileId: ctx.userProfileId,
    title,
    outcome,
    targetDate: session.draft_target_date,
    status: "active",
    primaryPillar: pillar,
    secondaryPillars: (theme.secondaryPillars ?? []).map((p) => p.toLowerCase()),
    northStarNote: typeof session.draft_config.why === "string" ? session.draft_config.why : null,
    projectType: session.project_type,
    config: session.draft_config,
  });

  if (!created.ok) {
    return {
      text: created.error,
      metadata: { specialist: "Magnus", pillar_compose: true, project_setup: true },
    };
  }

  const project = created.project;
  const listId = await seedChecklistList(
    ctx.userProfileId,
    project.id,
    title,
    session.draft_checklist.length > 0 ? session.draft_checklist : theme.defaultChecklist,
  );

  if (listId) {
    await updateProject(ctx.userProfileId, project.id, { checklist_list_id: listId });
  }

  const milestones =
    session.draft_milestones.length > 0 ? session.draft_milestones : theme.defaultMilestones;
  await createProjectMilestones(ctx.userProfileId, project.id, milestones);
  await lockProjectSession(ctx.userProfileId, session.id);

  return {
    text:
      `Locked **${title}**. Done when: ${outcome}` +
      (session.draft_target_date ? ` (by ${session.draft_target_date})` : "") +
      ".\n\nI'll track the checklist and milestones — just tell me progress in plain language.",
    metadata: {
      specialist: "Magnus",
      pillar_compose: false,
      project_setup: true,
      project_locked: true,
      project_id: project.id,
      project_setup_parser: "llm",
    },
  };
}

function draftMetadata(session: ProjectSessionRow, parsed: ParsedProjectSetupTurn): Record<string, unknown> {
  return {
    specialist: "Magnus",
    project_setup: true,
    project_setup_draft: true,
    project_session_id: session.id,
    project_setup_intent: parsed.intent,
    project_setup_parser: parsed.parser,
    project_setup_confidence: parsed.confidence,
  };
}

async function applyDraftPatch(
  session: ProjectSessionRow,
  parsed: ParsedProjectSetupTurn,
  themeDefaults: ReturnType<typeof getProjectTheme>,
): Promise<ProjectSessionRow> {
  const patch: Parameters<typeof updateProjectSession>[2] = {
    status: "draft",
    step: "review",
  };

  if (parsed.title) {
    patch.draft_title = parsed.title;
  }
  if (parsed.outcome) {
    patch.draft_outcome = parsed.outcome;
  }
  if (parsed.target_date !== undefined) {
    patch.draft_target_date = parsed.target_date;
  }
  if (parsed.checklist) {
    patch.draft_checklist = parsed.checklist;
  } else if (!session.draft_checklist.length) {
    patch.draft_checklist = themeDefaults.defaultChecklist;
  }
  if (parsed.milestones) {
    patch.draft_milestones = parsed.milestones;
  } else if (!session.draft_milestones.length) {
    patch.draft_milestones = themeDefaults.defaultMilestones;
  }

  await updateProjectSession(session.user_profile_id, session.id, patch);
  return (await getActiveProjectSession(session.user_profile_id))!;
}

export async function runProjectSetupFlow(
  ctx: AgentContext,
  preParsed?: ParsedProjectSetupTurn,
): Promise<AgentResult> {
  let session = await getActiveProjectSession(ctx.userProfileId);
  const parsed =
    preParsed ??
    (await parseProjectSetupTurn({
      message: ctx.rawMessage,
      session,
      fallbackThemeId: session?.project_type,
    }));

  if (
    parsed.intent === "cancel_setup" &&
    projectSetupIntentActionable(parsed)
  ) {
    if (session) {
      await abandonProjectSession(ctx.userProfileId, session.id);
    }
    return {
      text: "Cancelled project planning.",
      metadata: {
        specialist: "Magnus",
        project_setup: true,
        pillar_compose: true,
        project_setup_intent: parsed.intent,
        project_setup_parser: parsed.parser,
      },
    };
  }

  const themeId = session?.project_type ?? parsed.theme_id;
  const theme = getProjectTheme(themeId);

  if (!session) {
    const created = await createProjectSession(ctx.userProfileId, themeId);
    if (!created.ok) {
      return {
        text: created.error,
        metadata: { specialist: "Magnus", project_setup: true },
      };
    }
    session = created.session;
    await updateProjectSession(ctx.userProfileId, session.id, {
      project_type: themeId,
      primary_pillar: theme.primaryPillar.toLowerCase(),
      draft_checklist: parsed.checklist ?? theme.defaultChecklist,
      draft_milestones: parsed.milestones ?? theme.defaultMilestones,
      draft_outcome: parsed.outcome ?? theme.defaultOutcomePrompt,
      draft_title: parsed.title ?? theme.label,
      draft_target_date: parsed.target_date,
      step: parsed.intent === "provide_scope" ? "review" : "scope",
      status: "draft",
    });
    session = (await getActiveProjectSession(ctx.userProfileId))!;
  }

  if (parsed.intent === "lock" && projectSetupIntentActionable(parsed)) {
    return lockSessionToProject(ctx, session);
  }

  if (parsed.intent === "skip_defaults") {
    await updateProjectSession(ctx.userProfileId, session.id, {
      step: "review",
      status: "draft",
      draft_checklist:
        session.draft_checklist.length > 0 ? session.draft_checklist : theme.defaultChecklist,
      draft_milestones:
        session.draft_milestones.length > 0 ? session.draft_milestones : theme.defaultMilestones,
    });
    const updated = (await getActiveProjectSession(ctx.userProfileId))!;
    return {
      text: formatDraftReview(updated, theme.label),
      metadata: draftMetadata(updated, parsed),
    };
  }

  if (parsed.intent === "revise_draft" || parsed.intent === "provide_scope") {
    const updated = await applyDraftPatch(session, parsed, theme);
    return {
      text: formatDraftReview(updated, theme.label),
      metadata: draftMetadata(updated, parsed),
    };
  }

  return {
    text: formatDraftReview(session, theme.label),
    metadata: draftMetadata(session, parsed),
  };
}
