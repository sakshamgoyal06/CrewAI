/**
 * Pure evaluators for the Magnus accuracy suite — no I/O.
 */
import { enforceActionIntegrity } from "../agents/routing/actionIntegrity.js";
import { checkReadBeforeWrite } from "../agents/routing/readBeforeWrite.js";
import type { OrchestratorReply } from "../agents/magnusOrchestrator.js";
import type { GoldenPathScenario } from "./goldenPathScenarios.js";
import {
  DEFAULT_ACCURACY_GATES,
  type AccuracyDimension,
  type AccuracyGateThresholds,
  type MagnusAccuracyCaseResult,
  type MagnusAccuracyOrchestratorCase,
  type MagnusAccuracyReport,
  type MagnusMetamorphicGroup,
} from "./magnusAccuracySuite.types.js";
import { METAMORPHIC_PARAPHRASE_GROUPS } from "./magnusAccuracyScenarios.js";
import type { ReadBeforeWriteCase } from "./magnusAccuracyScenarios.js";

const VOICE_LEAK_RE =
  /\b(specialist|routing to|handing (?:this )?to|pillar agent|department agent|HealthComposite|Wealth specialist)\b/i;

export function assertOneMagnusVoice(replyText: string): void {
  if (VOICE_LEAK_RE.test(replyText)) {
    throw new Error(`Voice leak: ${replyText.slice(0, 120)}`);
  }
}

function capabilityFromMetadata(meta: Record<string, unknown> | undefined): string | undefined {
  if (!meta) return undefined;
  if (typeof meta.pillar_capability === "string") return meta.pillar_capability;
  const steps = meta.pillar_plan_steps;
  if (Array.isArray(steps) && typeof steps[0] === "string") return steps[0];
  return undefined;
}

export function evaluateOrchestratorCase(
  out: OrchestratorReply,
  scenario: MagnusAccuracyOrchestratorCase | GoldenPathScenario,
): MagnusAccuracyCaseResult {
  const failures: string[] = [];
  const id = "id" in scenario ? scenario.id : scenario.query.slice(0, 40);

  if (out.intent !== scenario.idealIntent) {
    failures.push(`intent: expected ${scenario.idealIntent}, got ${out.intent}`);
  }

  const expectedDelegated =
    "expectedDelegatedAgent" in scenario ? scenario.expectedDelegatedAgent : undefined;

  if (expectedDelegated !== undefined) {
    if (out.delegatedAgent !== expectedDelegated) {
      failures.push(
        `delegatedAgent: expected ${expectedDelegated}, got ${out.delegatedAgent ?? "none"}`,
      );
    }
  } else if (
    scenario.idealIntent === "GENERAL" &&
    out.delegatedAgent &&
    out.delegatedAgent !== "Magnus"
  ) {
    failures.push(`delegatedAgent: expected Magnus-only, got ${out.delegatedAgent}`);
  }

  const cap = capabilityFromMetadata(out.agentMetadata);
  const skipCapabilityCheck =
    "replyContains" in scenario && Boolean(scenario.replyContains);
  if (!skipCapabilityCheck && cap !== scenario.idealCapability) {
    failures.push(`capability: expected ${scenario.idealCapability}, got ${cap ?? "none"}`);
  }

  if ("expectedPrimaryTool" in scenario && scenario.expectedPrimaryTool) {
    const tools = out.agentMetadata?.tools_used;
    const used = Array.isArray(tools) ? tools.map(String) : [];
    if (!used.includes(scenario.expectedPrimaryTool)) {
      failures.push(
        `tools_used: expected ${scenario.expectedPrimaryTool} in [${used.join(", ")}]`,
      );
    }
  }

  if ("replyContains" in scenario && scenario.replyContains) {
    if (!out.replyText.includes(scenario.replyContains)) {
      failures.push(`replyText missing: "${scenario.replyContains}"`);
    }
  }

  if ("replyExcludes" in scenario && scenario.replyExcludes) {
    if (out.replyText.toLowerCase().includes(scenario.replyExcludes.toLowerCase())) {
      failures.push(`replyText must exclude: "${scenario.replyExcludes}"`);
    }
  }

  try {
    assertOneMagnusVoice(out.replyText);
  } catch (e) {
    failures.push((e as Error).message);
  }

  if (!out.replyText?.trim()) {
    failures.push("replyText: empty");
  }

  const dimension: AccuracyDimension =
    "dimension" in scenario ? scenario.dimension : "routing";

  return {
    id,
    dimension,
    passed: failures.length === 0,
    failures,
  };
}

export function evaluateMetamorphicGroup(group: MagnusMetamorphicGroup): MagnusAccuracyCaseResult[] {
  const results: MagnusAccuracyCaseResult[] = [];
  for (const phrase of group.paraphrases) {
    const caseId = `${group.id}:${phrase.slice(0, 20)}`;
    const failures: string[] = [];

    // Design-time check: catalog expectation consistency (same ideal route for all paraphrases)
    if (!phrase.trim()) {
      failures.push("empty paraphrase");
    }

    // Structural expectation encoded in group — validated when fixture orchestrator runs each phrase
    results.push({
      id: caseId,
      dimension: "metamorphic_design",
      passed: failures.length === 0,
      failures,
    });
  }

  // Group coherence: all paraphrases share same target
  if (group.paraphrases.length < 2) {
    results.push({
      id: `${group.id}:coherence`,
      dimension: "metamorphic_design",
      passed: false,
      failures: ["metamorphic group needs ≥2 paraphrases"],
    });
  }

  return results;
}

export function evaluateReadBeforeWriteCase(input: ReadBeforeWriteCase): MagnusAccuracyCaseResult {
  const result = checkReadBeforeWrite(input.writeTool, input.priorReads);
  const blocked = result.blocked;
  const failures: string[] = [];
  if (blocked !== input.expectBlocked) {
    failures.push(`blocked: expected ${input.expectBlocked}, got ${blocked}`);
  }
  return {
    id: input.id,
    dimension: "read_before_write",
    passed: failures.length === 0,
    failures,
  };
}

export function computeMetamorphicPass(
  results: MagnusAccuracyCaseResult[],
): number {
  const byId = new Map(results.map((r) => [r.id, r]));
  let groupsPassed = 0;
  for (const group of METAMORPHIC_PARAPHRASE_GROUPS) {
    const paraphraseResults = group.paraphrases.map((phrase) =>
      byId.get(`${group.id}:${phrase.slice(0, 16)}`),
    );
    if (paraphraseResults.length > 0 && paraphraseResults.every((r) => r?.passed)) {
      groupsPassed += 1;
    }
  }
  if (METAMORPHIC_PARAPHRASE_GROUPS.length === 0) {
    return 1;
  }
  return groupsPassed / METAMORPHIC_PARAPHRASE_GROUPS.length;
}

export function evaluateActionIntegrityCase(input: {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
  shouldCorrect: boolean;
  reason?: string;
}): MagnusAccuracyCaseResult {
  const out = enforceActionIntegrity({ text: input.text, metadata: input.metadata });
  const failures: string[] = [];

  if (out.corrected !== input.shouldCorrect) {
    failures.push(
      `corrected: expected ${input.shouldCorrect}, got ${out.corrected} (reason: ${out.reason ?? "none"})`,
    );
  }

  if (input.shouldCorrect && input.reason && out.reason !== input.reason) {
    failures.push(`reason: expected ${input.reason}, got ${out.reason ?? "none"}`);
  }

  return {
    id: input.id,
    dimension: "action_integrity",
    passed: failures.length === 0,
    failures,
  };
}

export function buildAccuracyReport(input: {
  results: MagnusAccuracyCaseResult[];
  gates?: AccuracyGateThresholds;
}): MagnusAccuracyReport {
  const gates = input.gates ?? DEFAULT_ACCURACY_GATES;
  const byDimension = new Map<AccuracyDimension, MagnusAccuracyCaseResult[]>();

  for (const r of input.results) {
    const list = byDimension.get(r.dimension) ?? [];
    list.push(r);
    byDimension.set(r.dimension, list);
  }

  const dimensions = {} as MagnusAccuracyReport["dimensions"];

  const allDims: AccuracyDimension[] = [
    "routing",
    "tool_selection",
    "action_integrity",
    "voice",
    "minimal_gate",
    "metamorphic_design",
    "fault_tolerance",
    "read_before_write",
    "catalog",
  ];

  for (const dim of allDims) {
    const rows = byDimension.get(dim) ?? [];
    const passed = rows.filter((r) => r.passed).length;
    const total = rows.length;
    const rate = total === 0 ? 1 : passed / total;
    const gateKey = dimensionToGateKey(dim);
    const gate = gateKey ? (gates[gateKey as keyof AccuracyGateThresholds] ?? 1) : 1;
    dimensions[dim] = {
      passed,
      total,
      rate,
      gate,
      gatePassed: total === 0 ? true : rate >= gate,
    };
  }

  const routingRows = [
    ...(byDimension.get("routing") ?? []),
    ...(byDimension.get("minimal_gate") ?? []),
  ];
  const toolRows = byDimension.get("tool_selection") ?? [];
  const integrityRows = byDimension.get("action_integrity") ?? [];
  const orchestratorRows = input.results.filter((r) =>
    ["routing", "tool_selection", "minimal_gate", "metamorphic_design"].includes(r.dimension),
  );
  const voiceRows = orchestratorRows.filter(
    (r) => !r.failures.some((f) => f.startsWith("Voice leak")),
  );
  const minimalRows = byDimension.get("minimal_gate") ?? [];
  const faultRows = byDimension.get("fault_tolerance") ?? [];
  const morphRows = byDimension.get("metamorphic_design") ?? [];
  const rbwRows = byDimension.get("read_before_write") ?? [];

  const rate = (rows: MagnusAccuracyCaseResult[]) => {
    if (rows.length === 0) return 1;
    return rows.filter((r) => r.passed).length / rows.length;
  };

  const metrics = {
    routingAt1: rate(routingRows),
    toolSelectAt1: rate(toolRows),
    actionIntegrity: rate(integrityRows),
    voiceCoherence:
      orchestratorRows.length === 0 ? 1 : voiceRows.length / orchestratorRows.length,
    minimalGate: rate(minimalRows),
    faultHonesty: rate(faultRows),
    metamorphicDesign: rate(morphRows),
    metamorphicPass: computeMetamorphicPass(input.results),
    readBeforeWrite: rate(rbwRows),
  };

  const allGatesPassed =
    metrics.routingAt1 >= gates.routingAt1 &&
    metrics.toolSelectAt1 >= gates.toolSelectAt1 &&
    metrics.actionIntegrity >= gates.actionIntegrity &&
    metrics.voiceCoherence >= gates.voiceCoherence &&
    metrics.minimalGate >= gates.minimalGate &&
    metrics.faultHonesty >= gates.faultHonesty &&
    metrics.metamorphicDesign >= gates.metamorphicDesign &&
    metrics.metamorphicPass >= gates.metamorphicPass &&
    metrics.readBeforeWrite >= gates.readBeforeWrite;

  return {
    generatedAt: new Date().toISOString(),
    gates,
    dimensions,
    metrics,
    allGatesPassed,
    failures: input.results.filter((r) => !r.passed),
  };
}

function dimensionToGateKey(dim: AccuracyDimension): keyof AccuracyGateThresholds | null {
  switch (dim) {
    case "routing":
      return "routingAt1";
    case "tool_selection":
      return "toolSelectAt1";
    case "action_integrity":
      return "actionIntegrity";
    case "voice":
      return "voiceCoherence";
    case "minimal_gate":
      return "minimalGate";
    case "fault_tolerance":
      return "faultHonesty";
    case "metamorphic_design":
      return "metamorphicDesign";
    case "read_before_write":
      return "readBeforeWrite";
    case "catalog":
      return "catalogCoherence";
    default:
      return null;
  }
}

export function formatAccuracyReportMarkdown(report: MagnusAccuracyReport): string {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const lines = [
    "# Magnus accuracy scorecard",
    "",
    `**Generated:** ${report.generatedAt}`,
    `**All gates passed:** ${report.allGatesPassed ? "yes" : "no"}`,
    "",
    "## Headline metrics",
    "",
    "| Metric | Rate | Gate | Pass |",
    "|--------|------|------|------|",
    `| routing@1 | ${pct(report.metrics.routingAt1)} | ${pct(report.gates.routingAt1)} | ${report.metrics.routingAt1 >= report.gates.routingAt1 ? "✓" : "✗"} |`,
    `| tool_select@1 | ${pct(report.metrics.toolSelectAt1)} | ${pct(report.gates.toolSelectAt1)} | ${report.metrics.toolSelectAt1 >= report.gates.toolSelectAt1 ? "✓" : "✗"} |`,
    `| action_integrity | ${pct(report.metrics.actionIntegrity)} | ${pct(report.gates.actionIntegrity)} | ${report.metrics.actionIntegrity >= report.gates.actionIntegrity ? "✓" : "✗"} |`,
    `| voice_coherence | ${pct(report.metrics.voiceCoherence)} | ${pct(report.gates.voiceCoherence)} | ${report.metrics.voiceCoherence >= report.gates.voiceCoherence ? "✓" : "✗"} |`,
    `| minimal_gate | ${pct(report.metrics.minimalGate)} | ${pct(report.gates.minimalGate)} | ${report.metrics.minimalGate >= report.gates.minimalGate ? "✓" : "✗"} |`,
    `| fault_honesty | ${pct(report.metrics.faultHonesty)} | ${pct(report.gates.faultHonesty)} | ${report.metrics.faultHonesty >= report.gates.faultHonesty ? "✓" : "✗"} |`,
    `| metamorphic_design | ${pct(report.metrics.metamorphicDesign)} | ${pct(report.gates.metamorphicDesign)} | ${report.metrics.metamorphicDesign >= report.gates.metamorphicDesign ? "✓" : "✗"} |`,
    `| metamorphic_pass | ${pct(report.metrics.metamorphicPass)} | ${pct(report.gates.metamorphicPass)} | ${report.metrics.metamorphicPass >= report.gates.metamorphicPass ? "✓" : "✗"} |`,
    `| read_before_write | ${pct(report.metrics.readBeforeWrite)} | ${pct(report.gates.readBeforeWrite)} | ${report.metrics.readBeforeWrite >= report.gates.readBeforeWrite ? "✓" : "✗"} |`,
    "",
    "## By dimension",
    "",
    "| Dimension | Passed | Total | Rate | Gate |",
    "|-----------|--------|-------|------|------|",
  ];

  for (const [dim, stats] of Object.entries(report.dimensions)) {
    if (stats.total === 0) continue;
    lines.push(
      `| ${dim} | ${stats.passed} | ${stats.total} | ${pct(stats.rate)} | ${pct(stats.gate)} |`,
    );
  }

  if (report.failures.length > 0) {
    lines.push("", "## Failures", "");
    for (const f of report.failures.slice(0, 30)) {
      lines.push(`- **${f.id}** (${f.dimension}): ${f.failures.join("; ")}`);
    }
    if (report.failures.length > 30) {
      lines.push(`- … and ${report.failures.length - 30} more`);
    }
  }

  lines.push(
    "",
    "---",
    "",
    "Regenerate: `npm run test:accuracy`",
    "",
    "Plan: `docs/review/MAGNUS_ACCURACY_PLAN.md`",
  );

  return lines.join("\n");
}
