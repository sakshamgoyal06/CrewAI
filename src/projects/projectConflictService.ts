/**
 * Detect competing active projects and suggest prioritization.
 */
import { listActiveProjects, updateProject } from "./projectStore.js";
import type { ProjectRow } from "./types.js";

export type ProjectConflictSignal = {
  kind: "multi_high_energy" | "too_many_active" | "stale_primary";
  projects: ProjectRow[];
  message: string;
};

export async function evaluateProjectConflicts(
  userProfileId: string,
): Promise<ProjectConflictSignal | null> {
  const active = (await listActiveProjects(userProfileId)).filter((p) => p.status === "active");

  if (active.length > 3) {
    return {
      kind: "too_many_active",
      projects: active,
      message: `You have ${active.length} active projects — consider pausing one.`,
    };
  }

  const highEnergy = active.filter((p) => p.energy_budget === "high");
  if (highEnergy.length >= 2) {
    return {
      kind: "multi_high_energy",
      projects: highEnergy,
      message: `**${highEnergy[0]!.title}** and **${highEnergy[1]!.title}** both need high energy — pick a primary for the next couple of weeks?`,
    };
  }

  return null;
}

export async function deprioritizeProject(projectId: string): Promise<void> {
  await updateProject(projectId, { energy_budget: "low", priority_rank: 3 });
}

export async function prioritizeProject(
  userProfileId: string,
  projectId: string,
): Promise<void> {
  const active = await listActiveProjects(userProfileId);
  await updateProject(projectId, { priority_rank: 1, energy_budget: "high" });
  for (const p of active) {
    if (p.id !== projectId) {
      await updateProject(p.id, {
        priority_rank: Math.min(p.priority_rank + 1, 5),
        energy_budget: p.energy_budget === "high" ? "medium" : p.energy_budget,
      });
    }
  }
}
