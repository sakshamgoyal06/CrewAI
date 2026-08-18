/**
 * Assemble routing context before intent classification.
 * Loads only what disambiguates intent — full memory loads after classify.
 */
import { buildIntentRoutingHints } from "../routing/intentRoutingHints.js";
import { fetchUserHealthProfile } from "../health/healthOnboarding.js";
import { loadSemanticFacts } from "../memory/semanticMemory.js";
import { loadUserProgramMemory } from "../../users/userProgramMemory.js";
import { loadUserIntegrations } from "../../users/userIntegrations.js";
import { getMealLogPending } from "../../meals/mealLogPending.js";
import { getReversibleAction } from "../routing/reversibleAction.js";
import { getActiveMealPlanSession } from "../../nutrition/planning/mealPlanningSessionStore.js";
import { getActiveProjectSession } from "../../projects/projectSessionStore.js";
import { listActiveProjects } from "../../projects/projectStore.js";
import { fetchRecentRoutingTurns } from "../../tools/routingContext.js";
import { supabase } from "../../tools/clients.js";
import { logger } from "../../logger.js";
import { loggableError } from "../../util/loggableError.js";
import { buildIntegrationRegistry } from "./integrationRegistry.js";
import { loadGrowthSnapshot } from "./loadGrowthSnapshot.js";
import { normalizeRoutingRecentTurns } from "./normalizeRecentTurns.js";
import type { RoutingContext, RoutingStandingContext } from "./types.js";

const ROUTING_FACT_KEYWORDS =
  /\b(?:avoid|don'?t|never|allerg|restrict|prefer|always|rule|except|friday|burger|lauki|coriander)\b/i;

const PROGRAM_NOTE_HEADINGS = ["Restrictions", "Nutrition patterns", "Standing rules", "Avoid"];

function parseMarkdownSectionBullets(body: string, heading: string): string[] {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`##\\s*${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i");
  const match = body.match(re);
  if (!match?.[1]) {
    return [];
  }
  return match[1]
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, 4);
}

async function loadStandingContext(userProfileId: string): Promise<RoutingStandingContext> {
  const [facts, programRows] = await Promise.all([
    loadSemanticFacts(userProfileId, 12),
    loadUserProgramMemory(userProfileId),
  ]);

  const routingFacts = facts
    .filter((f) => ROUTING_FACT_KEYWORDS.test(f))
    .slice(0, 6);

  const programNotes: string[] = [];
  for (const row of programRows) {
    const body = typeof row.body === "string" ? row.body : "";
    if (!body.trim()) {
      continue;
    }
    for (const heading of PROGRAM_NOTE_HEADINGS) {
      programNotes.push(...parseMarkdownSectionBullets(body, heading));
    }
    if (programNotes.length >= 8) {
      break;
    }
  }

  return {
    programNotes: [...new Set(programNotes)].slice(0, 8),
    routingFacts,
  };
}

async function countOpenCommitmentsToday(
  userProfileId: string,
  timezone: string,
): Promise<{ count: number; gymToday: boolean }> {
  try {
    const now = new Date();
    const localDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);

    const { data, error } = await supabase
      .from("magnus_events")
      .select("id, title, pillar, status, planned_start_at")
      .eq("user_profile_id", userProfileId)
      .in("status", ["planned", "in_progress"])
      .gte("planned_start_at", `${localDate}T00:00:00`)
      .lte("planned_start_at", `${localDate}T23:59:59`)
      .limit(12);

    if (error || !data?.length) {
      return { count: 0, gymToday: false };
    }

    const gymToday = data.some((row) => {
      const title = String(row.title ?? "").toLowerCase();
      const pillar = String(row.pillar ?? "").toLowerCase();
      return pillar === "health" && /\b(gym|workout|train|hevy|legs|push|pull)\b/.test(title);
    });

    return { count: data.length, gymToday };
  } catch (err) {
    logger.warn({ err: loggableError(err), userProfileId }, "routing: open commitments load failed");
    return { count: 0, gymToday: false };
  }
}

export type AssembleRoutingContextInput = {
  userProfileId: string;
  telegramUserId: string;
  userMessage: string;
  displayName?: string;
  timezone?: string;
  northStarGoal?: string;
};

export async function assembleRoutingContext(
  input: AssembleRoutingContextInput,
): Promise<RoutingContext> {
  const gaps: string[] = [];
  const timezone = input.timezone?.trim() || "UTC";
  const northStarGoal = input.northStarGoal?.trim() || "";

  const [
    recentRaw,
    integrationsRow,
    healthProfile,
    mealPending,
    reversible,
    projectSession,
    mealPlanSession,
    activeProjects,
    standing,
    openToday,
    growth,
  ] = await Promise.all([
    fetchRecentRoutingTurns(input.userProfileId, input.telegramUserId, 8),
    loadUserIntegrations(input.userProfileId),
    fetchUserHealthProfile(input.userProfileId),
    getMealLogPending(input.userProfileId),
    getReversibleAction(input.userProfileId),
    getActiveProjectSession(input.userProfileId),
    getActiveMealPlanSession(input.userProfileId),
    listActiveProjects(input.userProfileId).catch(() => []),
    loadStandingContext(input.userProfileId),
    countOpenCommitmentsToday(input.userProfileId, timezone),
    loadGrowthSnapshot({ userProfileId: input.userProfileId, timezone }),
  ]);

  const recentTurns = normalizeRoutingRecentTurns(recentRaw);
  const routingHints = buildIntentRoutingHints(input.userMessage, recentRaw);

  const integrations = buildIntegrationRegistry(integrationsRow);

  const pending: RoutingContext["pending"] = {};
  if (mealPending) {
    pending.mealLogConfirm = {
      preview: mealPending.rawText || mealPending.originalMessage,
      mealSlot: mealPending.mealSlot,
    };
  }
  if (reversible) {
    pending.reversibleUndo = {
      kind: reversible.kind,
      summary: reversible.summary,
    };
  }
  if (projectSession) {
    pending.projectSession = {
      theme: projectSession.project_type ?? "custom",
      step: projectSession.step,
      status: projectSession.status,
    };
  }
  if (mealPlanSession) {
    const horizon =
      mealPlanSession.horizon_start && mealPlanSession.horizon_end
        ? `${mealPlanSession.horizon_start}–${mealPlanSession.horizon_end}`
        : undefined;
    pending.mealPlanSession = {
      step: mealPlanSession.step,
      status: mealPlanSession.status,
      horizon,
    };
  }

  if (integrations.googleCalendar === "not_connected" && routingHints.schedule_accuracy_challenge) {
    gaps.push("calendar: not connected but user challenged schedule accuracy");
  }

  return {
    userProfileId: input.userProfileId,
    assembledAt: new Date().toISOString(),
    identity: {
      displayName: input.displayName?.trim() || undefined,
      timezone,
      northStarGoal,
      healthOnboardingComplete: Boolean(healthProfile?.onboarding_completed_at),
    },
    integrations,
    recentTurns,
    pending,
    activeWork: {
      activeProjects: activeProjects.slice(0, 3).map((p) => ({
        title: p.title,
        pillar: p.primary_pillar,
        projectType: p.project_type,
        status: p.status,
      })),
      gymEventToday: openToday.gymToday,
      openCommitmentCount: openToday.count,
    },
    standing,
    growth,
    routingHints,
    gaps,
  };
}
