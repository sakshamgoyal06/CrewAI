/**
 * Structured outcomes for pillar_consultation turns — what Magnus vs pillars did,
 * whether the user request was fulfilled, and what stale disclaimers to strip.
 */
import type { ToolOutcome } from "./actionIntegrity.js";
import { hasSuccessfulWriteTool } from "./actionIntegrity.js";
import type { ConsultablePillarIntent } from "./pillarConsultationSignals.js";
import type { AgentResult } from "../types.js";

export type PillarConsultationCandidate = {
  intent: ConsultablePillarIntent;
  agentName: string;
  result: AgentResult;
};

export type ConsultationReconcileInput = {
  userMessage: string;
  magnus: AgentResult;
  pillars: PillarConsultationCandidate[];
};

export type ConsultationMagnusAction = {
  tool: string;
  ok: boolean;
  preview: string;
};

export type ConsultationPillarOutcome = {
  intent: ConsultablePillarIntent;
  fulfilled: boolean;
  dataSignals: string[];
  specialist?: string;
  text: string;
};

export type ConsultationOutcomeSummary = {
  userMessage: string;
  magnusActions: ConsultationMagnusAction[];
  magnusWriteSucceeded: boolean;
  pillarOutcomes: ConsultationPillarOutcome[];
  /** True when consulted pillars delivered substantive data and/or Magnus completed writes the user asked for. */
  userRequestFulfilled: boolean;
  delegationBlock: string;
};

const MAGNUS_DENIES_HEVY_RE =
  /\b(?:don'?t|do not|cannot|can'?t|unable to)\b.{0,80}\b(?:hevy|workout data|sets?|reps?|weights?)\b|\bno (?:direct )?hevy\b|\bnot connected\b.{0,40}\bhevy\b|\bhevy workout history integration\b/i;

const MAGNUS_DENIES_KITE_RE =
  /\b(?:don'?t|do not|cannot|can'?t|unable to)\b.{0,80}\b(?:kite|zerodha|portfolio|holdings?)\b|\bno (?:direct )?(?:kite|zerodha|portfolio)\b/i;

/** Paragraph-level stale disclaimers Magnus may emit when a pillar already handled the read. */
const STALE_DENIAL_PARAGRAPH_RES: Record<ConsultablePillarIntent, RegExp> = {
  HEALTH: MAGNUS_DENIES_HEVY_RE,
  WEALTH: MAGNUS_DENIES_KITE_RE,
  HAPPINESS: /$^/,
  WISDOM: /$^/,
};

const PILLAR_DELEGATION_LINES: Record<ConsultablePillarIntent, string> = {
  HEALTH:
    "Workout / Hevy reads and training coaching are handled by Health on this turn — not Magnus tools.",
  WEALTH:
    "Portfolio / Zerodha reads are handled by Wealth on this turn — not Magnus tools.",
  HAPPINESS: "Taste and leisure depth is handled by Happiness when consulted.",
  WISDOM: "Learning and career depth is handled by Wisdom when consulted.",
};

function toolOutcomes(meta: Record<string, unknown>): ToolOutcome[] {
  const raw = meta.tool_outcomes;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (row): row is ToolOutcome =>
      typeof row === "object" &&
      row !== null &&
      typeof (row as ToolOutcome).name === "string" &&
      typeof (row as ToolOutcome).ok === "boolean",
  );
}

function healthDataSignals(meta: Record<string, unknown>): string[] {
  const signals: string[] = [];
  if (meta.workout_source === "hevy" && meta.workout_data === "loaded") {
    signals.push("hevy_loaded");
  }
  if (meta.meal_log === true) {
    signals.push("meal_logged");
  }
  if (meta.journal_saved === true) {
    signals.push("journal_saved");
  }
  if (typeof meta.health_order === "string" && meta.health_order !== "fallback") {
    signals.push(`health_${meta.health_order}`);
  }
  return signals;
}

function wealthDataSignals(meta: Record<string, unknown>): string[] {
  const signals: string[] = [];
  if (meta.kite === "loaded") {
    signals.push("kite_loaded");
  }
  if (meta.kite_connect === true) {
    signals.push("kite_connect");
  }
  return signals;
}

function pillarDataSignals(
  intent: ConsultablePillarIntent,
  meta: Record<string, unknown>,
): string[] {
  switch (intent) {
    case "HEALTH":
      return healthDataSignals(meta);
    case "WEALTH":
      return wealthDataSignals(meta);
    default:
      return meta.genericAck === true ? [] : ["substantive_reply"];
  }
}

function pillarFulfilled(intent: ConsultablePillarIntent, meta: Record<string, unknown>): boolean {
  const signals = pillarDataSignals(intent, meta);
  if (signals.length > 0 && !signals.every((s) => s === "substantive_reply")) {
    return true;
  }
  if (intent === "HAPPINESS" || intent === "WISDOM") {
    return signals.includes("substantive_reply");
  }
  return false;
}

function magnusActionsFromMeta(meta: Record<string, unknown>): ConsultationMagnusAction[] {
  return toolOutcomes(meta).map((o) => ({
    tool: o.name,
    ok: o.ok,
    preview: o.preview ?? "",
  }));
}

/** Build the delegation block injected into Magnus during pillar_consultation. */
export function buildMagnusConsultationDelegationBlock(
  pillars: ConsultablePillarIntent[],
): string {
  const lines = pillars.map((p) => PILLAR_DELEGATION_LINES[p]);
  return [
    "Pillar consultation (this turn):",
    ...lines.map((l) => `- ${l}`),
    "- Your job: Magnus tools the user asked for (event log, calendar, lists, check-ins).",
    "- Do NOT apologize for lacking Hevy, Kite, or other pillar data reads — those run in parallel.",
    "- Do NOT ask the user to paste workout or portfolio data when a pillar is consulted.",
    "- Confirm only what your tools actually did; keep prose minimal when a pillar handles the review.",
  ].join("\n");
}

export function buildConsultationOutcomeSummary(
  input: ConsultationReconcileInput,
): ConsultationOutcomeSummary {
  const magnusMeta = input.magnus.metadata ?? {};
  const magnusActions = magnusActionsFromMeta(magnusMeta);
  const magnusWriteSucceeded = hasSuccessfulWriteTool(magnusMeta);

  const pillarOutcomes: ConsultationPillarOutcome[] = input.pillars.map((p) => {
    const meta = p.result.metadata ?? {};
    const dataSignals = pillarDataSignals(p.intent, meta);
    return {
      intent: p.intent,
      fulfilled: pillarFulfilled(p.intent, meta),
      dataSignals,
      specialist: typeof meta.specialist === "string" ? meta.specialist : p.agentName,
      text: p.result.text.trim(),
    };
  });

  const pillarReadFulfilled = pillarOutcomes.some((p) => p.fulfilled);
  const userRequestFulfilled = pillarReadFulfilled || magnusWriteSucceeded;

  const consulted = [...new Set(input.pillars.map((p) => p.intent))];
  const delegationBlock = buildMagnusConsultationDelegationBlock(consulted);

  return {
    userMessage: input.userMessage.trim(),
    magnusActions,
    magnusWriteSucceeded,
    pillarOutcomes,
    userRequestFulfilled,
    delegationBlock,
  };
}

/** Remove paragraphs where Magnus disclaims a capability a consulted pillar already fulfilled. */
export function stripStaleCapabilityDenials(
  text: string,
  summary: ConsultationOutcomeSummary,
): string {
  const fulfilled = new Set(
    summary.pillarOutcomes.filter((p) => p.fulfilled).map((p) => p.intent),
  );
  if (fulfilled.size === 0) {
    return text.trim();
  }

  const paragraphs = text.split(/\n\n+/);
  const kept = paragraphs.filter((para) => {
    const trimmed = para.trim();
    if (!trimmed) {
      return false;
    }
    for (const intent of fulfilled) {
      if (STALE_DENIAL_PARAGRAPH_RES[intent].test(trimmed)) {
        return false;
      }
    }
    return true;
  });

  return kept.join("\n\n").trim();
}

/**
 * Magnus prose to merge after a pillar review — strip stale denials;
 * when Magnus only wrote tools, prefer short action confirmation over full chatty reply.
 */
export function magnusTextForConsultationMerge(
  magnusText: string,
  magnusMeta: Record<string, unknown>,
  summary: ConsultationOutcomeSummary,
): string {
  const stripped = stripStaleCapabilityDenials(magnusText, summary);
  if (!stripped) {
    return "";
  }

  const pillarDidReview = summary.pillarOutcomes.some((p) => p.fulfilled && p.text.length > 40);
  if (!pillarDidReview) {
    return stripped;
  }

  if (!summary.magnusWriteSucceeded) {
    return stripped;
  }

  const actionLines = summary.magnusActions
    .filter((a) => a.ok)
    .map((a) => a.preview.trim())
    .filter(Boolean);

  if (actionLines.length > 0 && stripped.length > 280) {
    const confirmations = actionLines.map((p) => p.split("\n")[0]).join(" ");
    return confirmations.slice(0, 400);
  }

  return stripped;
}

/** JSON-safe summary for chat metadata (no pillar prose). */
export function slimConsultationOutcomeForMeta(summary: ConsultationOutcomeSummary) {
  return {
    user_request_fulfilled: summary.userRequestFulfilled,
    magnus_write_succeeded: summary.magnusWriteSucceeded,
    magnus_actions: summary.magnusActions,
    pillars: summary.pillarOutcomes.map((p) => ({
      intent: p.intent,
      fulfilled: p.fulfilled,
      data_signals: p.dataSignals,
      specialist: p.specialist,
    })),
    delegation_block: summary.delegationBlock,
  };
}

export function formatConsultationOutcomeForCompose(summary: ConsultationOutcomeSummary): string {
  const lines: string[] = [
    `User message: ${summary.userMessage}`,
    `Request fulfilled (architecture): ${summary.userRequestFulfilled ? "yes" : "no"}`,
    "",
    "Delegation (internal — do not mention specialists):",
    summary.delegationBlock,
    "",
  ];

  if (summary.magnusActions.length > 0) {
    lines.push("Magnus tool outcomes:");
    for (const a of summary.magnusActions) {
      lines.push(`- ${a.tool}: ${a.ok ? "ok" : "failed"} — ${a.preview.slice(0, 200)}`);
    }
    lines.push("");
  }

  if (summary.pillarOutcomes.length > 0) {
    lines.push("Pillar outcomes:");
    for (const p of summary.pillarOutcomes) {
      lines.push(
        `- ${p.intent}: fulfilled=${p.fulfilled}${p.dataSignals.length ? ` (${p.dataSignals.join(", ")})` : ""}`,
      );
    }
    lines.push("");
  }

  lines.push(
    "Compose rules:",
    "- Answer as Magnus in one voice — the user asked for a combined outcome.",
    "- When a pillar fulfilled a read (Hevy, Kite, etc.), present that data as yours; never say you cannot pull it.",
    "- When Magnus tools succeeded (event log, check-in), confirm those actions briefly.",
    "- Do not repeat stale capability disclaimers from partial agent drafts.",
    "- Only cite workout total volume (kg) when step outcomes include a computed session volume — never estimate.",
  );

  return lines.join("\n");
}
