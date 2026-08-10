/**
 * Multi-turn project setup: intent → scope → checklist → milestones → review → lock.
 */
import type { AgentContext, AgentResult } from "../agents/types.js";
import { createCustomList } from "../lists/listService.js";
import { fetchListBySlug } from "../lists/listStore.js";
import { insertListItem } from "../lists/listStore.js";
import { getProjectTheme, inferThemeFromMessage } from "./themes/index.js";
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
  PROJECT_CANCEL_RE,
  PROJECT_LOCK_RE,
  PROJECT_SKIP_RE,
} from "./projectSetupSignals.js";

function parseDateFromText(text: string): string | null {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) {
    return iso[1]!;
  }
  const month = text.match(
    /\b(?:by|before|until|deadline)\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(20\d{2}))?\b/i,
  );
  if (month) {
    const months: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    };
    const mKey = month[1]!.slice(0, 3).toLowerCase();
    const mm = months[mKey];
    const dd = month[2]!.padStart(2, "0");
    const yyyy = month[3] ?? String(new Date().getFullYear());
    if (mm) {
      return `${yyyy}-${mm}-${dd}`;
    }
  }
  return null;
}

function extractTitle(raw: string, themeLabel: string): string {
  const trimmed = raw.trim();
  if (trimmed.length > 4 && trimmed.length < 120) {
    return trimmed.slice(0, 120);
  }
  return themeLabel;
}

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
    'Reply **lock it in** to start, or tell me what to change.',
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
    await updateProject(project.id, { checklist_list_id: listId });
  }

  const milestones =
    session.draft_milestones.length > 0 ? session.draft_milestones : theme.defaultMilestones;
  await createProjectMilestones(ctx.userProfileId, project.id, milestones);
  await lockProjectSession(session.id);

  return {
    text:
      `Locked **${title}**. Done when: ${outcome}` +
      (session.draft_target_date ? ` (by ${session.draft_target_date})` : "") +
      ".\n\nI'll track the checklist and milestones — just tell me progress in plain language.",
    metadata: {
      specialist: "Magnus",
      pillar_compose: false,
      project_locked: true,
      project_id: project.id,
    },
  };
}

export async function runProjectSetupFlow(ctx: AgentContext): Promise<AgentResult> {
  const raw = ctx.rawMessage.trim();
  if (PROJECT_CANCEL_RE.test(raw)) {
    const session = await getActiveProjectSession(ctx.userProfileId);
    if (session) {
      await abandonProjectSession(session.id);
    }
    return {
      text: "Cancelled project planning.",
      metadata: { specialist: "Magnus", project_setup: true, pillar_compose: true },
    };
  }

  const themeId = inferThemeFromMessage(raw);
  const theme = getProjectTheme(themeId);
  let session = await getActiveProjectSession(ctx.userProfileId);

  if (!session) {
    const created = await createProjectSession(ctx.userProfileId, themeId);
    if (!created.ok) {
      return {
        text: created.error,
        metadata: { specialist: "Magnus", project_setup: true },
      };
    }
    session = created.session;
    await updateProjectSession(session.id, {
      project_type: themeId,
      primary_pillar: theme.primaryPillar.toLowerCase(),
      draft_checklist: theme.defaultChecklist,
      draft_milestones: theme.defaultMilestones,
      draft_outcome: theme.defaultOutcomePrompt,
      step: "scope",
    });
    session = (await getActiveProjectSession(ctx.userProfileId))!;
  }

  if (session.step === "review" || session.status === "draft") {
    if (PROJECT_LOCK_RE.test(raw)) {
      return lockSessionToProject(ctx, session);
    }
  }

  const step = session.step;

  if (step === "intent" || step === "scope") {
    const title = extractTitle(raw, theme.label);
    const outcome =
      raw.match(/\b(?:done when|goal is|outcome is|finish when)\s*[:\-]?\s*(.+)/i)?.[1]?.trim() ??
      session.draft_outcome ??
      theme.defaultOutcomePrompt;
    const targetDate = parseDateFromText(raw) ?? session.draft_target_date;

    await updateProjectSession(session.id, {
      status: "draft",
      step: "review",
      draft_title: title !== theme.label ? title : session.draft_title ?? title,
      draft_outcome: outcome,
      draft_target_date: targetDate,
      draft_checklist:
        session.draft_checklist.length > 0 ? session.draft_checklist : theme.defaultChecklist,
      draft_milestones:
        session.draft_milestones.length > 0 ? session.draft_milestones : theme.defaultMilestones,
    });

    const updated = (await getActiveProjectSession(ctx.userProfileId))!;
    return {
      text: formatDraftReview(updated, theme.label),
      metadata: {
        specialist: "Magnus",
        project_setup: true,
        project_setup_draft: true,
        project_session_id: session.id,
      },
    };
  }

  if (PROJECT_LOCK_RE.test(raw)) {
    return lockSessionToProject(ctx, session);
  }

  if (PROJECT_SKIP_RE.test(raw)) {
    await updateProjectSession(session.id, { step: "review", status: "draft" });
    const updated = (await getActiveProjectSession(ctx.userProfileId))!;
    return {
      text: formatDraftReview(updated, theme.label),
      metadata: { specialist: "Magnus", project_setup: true, project_setup_draft: true },
    };
  }

  return {
    text: formatDraftReview(session, theme.label),
    metadata: {
      specialist: "Magnus",
      project_setup: true,
      project_setup_draft: true,
      project_session_id: session.id,
    },
  };
}
