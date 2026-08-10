import type { OrchestratorReply } from "../agents/magnusOrchestrator.js";
import type { GoldenPathScenario } from "./goldenPathScenarios.js";

const VOICE_LEAK_RE =
  /\b(specialist|routing to|handing (?:this )?to|pillar agent|department agent|HealthComposite|Wealth specialist)\b/i;

export function assertOneMagnusVoice(replyText: string): void {
  if (VOICE_LEAK_RE.test(replyText)) {
    throw new Error(`Voice leak in reply: ${replyText.slice(0, 120)}`);
  }
}

export function capabilityFromMetadata(meta: Record<string, unknown> | undefined): string | undefined {
  if (!meta) return undefined;
  if (typeof meta.pillar_capability === "string") return meta.pillar_capability;
  const steps = meta.pillar_plan_steps;
  if (Array.isArray(steps) && typeof steps[0] === "string") return steps[0];
  return undefined;
}

export function assertGoldenPathOutcome(
  out: OrchestratorReply,
  scenario: GoldenPathScenario,
): { passed: boolean; failures: string[] } {
  const failures: string[] = [];

  if (out.intent !== scenario.idealIntent) {
    failures.push(`intent: expected ${scenario.idealIntent}, got ${out.intent}`);
  }

  const cap = capabilityFromMetadata(out.agentMetadata);
  if (cap !== scenario.idealCapability) {
    failures.push(
      `capability: expected ${scenario.idealCapability}, got ${cap ?? "none"}`,
    );
  }

  if (scenario.expectedDelegatedAgent !== undefined) {
    if (out.delegatedAgent !== scenario.expectedDelegatedAgent) {
      failures.push(
        `delegatedAgent: expected ${scenario.expectedDelegatedAgent}, got ${out.delegatedAgent ?? "none"}`,
      );
    }
  } else if (out.delegatedAgent) {
    failures.push(`delegatedAgent: expected Magnus-only, got ${out.delegatedAgent}`);
  }

  if (scenario.idealIntent === "GENERAL") {
    const specialist = out.agentMetadata?.specialist;
    if (specialist && specialist !== "Magnus") {
      failures.push(`specialist: expected Magnus, got ${String(specialist)}`);
    }
  }

  if (scenario.expectedPrimaryTool) {
    const tools = out.agentMetadata?.tools_used;
    const used = Array.isArray(tools) ? tools.map(String) : [];
    if (!used.includes(scenario.expectedPrimaryTool)) {
      failures.push(
        `tools_used: expected ${scenario.expectedPrimaryTool} in [${used.join(", ")}]`,
      );
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

  return { passed: failures.length === 0, failures };
}
