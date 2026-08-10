/**
 * Accountability Agent — terminal gate: vet tool claims, compose Magnus voice, action ledger.
 */
import type { AgentContext } from "../types.js";
import { enforceActionIntegrity, type ToolOutcome } from "./actionIntegrity.js";
import { finalizeMagnusVoice } from "./finalizeMagnusVoice.js";

export type ActionLedgerEntry = {
  agent: string;
  capability?: string;
  tool: string;
  ok: boolean;
  preview: string;
  project_id?: string;
};

export type AccountabilityMetadata = {
  vetted: true;
  corrections_applied: boolean;
  claims_verified: boolean;
  failed_tools: string[];
};

function toolOutcomesToLedger(
  meta: Record<string, unknown>,
  agent: string,
): ActionLedgerEntry[] {
  const raw = meta.tool_outcomes;
  if (!Array.isArray(raw)) {
    return [];
  }
  const capability =
    typeof meta.pillar_capability === "string" ? meta.pillar_capability : undefined;
  const projectId =
    typeof meta.project_id === "string" ? meta.project_id : undefined;

  return raw
    .filter(
      (row): row is ToolOutcome =>
        typeof row === "object" &&
        row !== null &&
        typeof (row as ToolOutcome).name === "string" &&
        typeof (row as ToolOutcome).ok === "boolean",
    )
    .map((row) => ({
      agent,
      capability,
      tool: row.name,
      ok: row.ok,
      preview: row.preview ?? "",
      ...(projectId ? { project_id: projectId } : {}),
    }));
}

function resolveAgentLabel(meta: Record<string, unknown>, intent?: string): string {
  if (typeof meta.delegated_agent === "string" && meta.delegated_agent.trim()) {
    return meta.delegated_agent.trim();
  }
  if (typeof meta.intent === "string" && meta.intent.trim()) {
    return meta.intent.trim();
  }
  if (typeof intent === "string" && intent.trim()) {
    return intent.trim();
  }
  if (typeof meta.specialist === "string") {
    const s = meta.specialist.toLowerCase();
    if (s.includes("health")) return "HEALTH";
    if (s.includes("wealth")) return "WEALTH";
    if (s.includes("wisdom")) return "WISDOM";
    if (s.includes("happiness") || s.includes("joy")) return "HAPPINESS";
  }
  return "GENERAL";
}

export async function vetAndCompose(input: {
  ctx: AgentContext;
  text: string;
  metadata?: Record<string, unknown>;
  intent?: string;
}): Promise<{ text: string; metadata: Record<string, unknown> }> {
  const baseMeta = { ...(input.metadata ?? {}) };
  const agent = resolveAgentLabel(baseMeta, input.intent);

  const voiced = await finalizeMagnusVoice(input.ctx, input.text, baseMeta);
  const integrity = enforceActionIntegrity({
    text: voiced.text,
    metadata: voiced.metadata,
  });

  const ledger = toolOutcomesToLedger(integrity.metadata, agent);
  const failedTools = ledger.filter((e) => !e.ok).map((e) => e.tool);

  const accountability: AccountabilityMetadata = {
    vetted: true,
    corrections_applied: integrity.corrected,
    claims_verified: failedTools.length === 0 || !integrity.corrected,
    failed_tools: failedTools,
  };

  return {
    text: integrity.text,
    metadata: {
      ...integrity.metadata,
      delegated_agent: agent,
      ...(ledger.length > 0 ? { action_ledger: ledger } : {}),
      accountability,
    },
  };
}
