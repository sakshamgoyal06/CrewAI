import {
  createLifeosGoal,
  listActiveLifeosGoals,
  logHappinessReserve,
  upsertPillarStatus,
} from "./lifeosStore.js";

export async function lifeosAddGoal(input: {
  userProfileId: string;
  title: string;
  pillar?: string;
  timeframe?: string;
  status?: string;
  description?: string;
}): Promise<string> {
  const result = await createLifeosGoal({
    userProfileId: input.userProfileId,
    title: input.title,
    pillar: input.pillar,
    timeframe: input.timeframe,
    status: input.status,
    description: input.description,
  });
  if (!result.ok) {
    return `Could not save goal to LifeOS: ${result.error}`;
  }
  return `Saved LifeOS goal (${result.data.id.slice(0, 8)}…).`;
}

export async function lifeosUpdatePillarStatus(input: {
  userProfileId: string;
  pillar: string;
  date?: string;
  status: string;
  score?: number;
  summary?: string;
}): Promise<string> {
  const date = input.date?.trim() || new Date().toISOString().slice(0, 10);
  const result = await upsertPillarStatus({
    userProfileId: input.userProfileId,
    pillar: input.pillar,
    date,
    status: input.status,
    score: input.score,
    summary: input.summary,
  });
  if (!result.ok) {
    return `Could not update pillar status: ${result.error}`;
  }
  return `Updated ${input.pillar} status for ${date} → ${input.status}.`;
}

export async function lifeosLogJoyTank(input: {
  userProfileId: string;
  level: number;
  date?: string;
  notes?: string;
  selfReportedState?: string;
}): Promise<string> {
  const date = input.date?.trim() || new Date().toISOString().slice(0, 10);
  const result = await logHappinessReserve({
    userProfileId: input.userProfileId,
    date,
    level: input.level,
    notes: input.notes,
    selfReportedState: input.selfReportedState,
  });
  if (!result.ok) {
    return `Could not log joy tank: ${result.error}`;
  }
  return `Logged joy tank ${input.level}/100 for ${date}.`;
}

export async function lifeosListGoals(input: {
  userProfileId: string;
  limit?: number;
}): Promise<string> {
  const result = await listActiveLifeosGoals(input.userProfileId, input.limit ?? 12);
  if (!result.ok) {
    return `Could not list LifeOS goals: ${result.error}`;
  }
  if (result.data.length === 0) {
    return "No active LifeOS goals.";
  }
  const lines = result.data.map((g) => `• [${g.pillar}] ${g.title} (${g.status})`);
  return `Active LifeOS goals (${result.data.length}):\n${lines.join("\n")}`;
}
