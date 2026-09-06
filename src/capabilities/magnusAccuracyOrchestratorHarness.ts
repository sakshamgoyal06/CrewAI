/**
 * Helpers for accuracy-suite orchestrator fixture runs (no hoisted state).
 */
import type { GoldenPathScenario } from "./goldenPathScenarios.js";

export function textReply(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function toolReply(name: string, input: Record<string, unknown> = {}) {
  return {
    content: [{ type: "tool_use" as const, id: `tool_${name}`, name, input }],
  };
}

export function buildAnthropicMockHandler(state: {
  scenario: GoldenPathScenario | null;
  anthropicCalls: number;
}) {
  return async (params: {
    max_tokens?: number;
    system?: string;
    messages?: unknown;
    tools?: { name: string }[];
  }) => {
    state.anthropicCalls += 1;
    const scenario = state.scenario;
    if (!scenario) {
      return textReply("fallback");
    }

    const msgs = params.messages as Array<{ role: string; content: unknown }> | undefined;
    if (msgs && msgs.length > 0) {
      const last = msgs[msgs.length - 1];
      if (last?.role === "user" && Array.isArray(last.content)) {
        const hasToolResult = last.content.some(
          (b: { type?: string }) => b?.type === "tool_result",
        );
        if (hasToolResult) {
          return textReply("Magnus reply for the user.");
        }
      }
    }

    if (params.max_tokens === 16) {
      return textReply(scenario.idealIntent);
    }

    const system = String(params.system ?? "");
    if (system.includes("ordered execution plan")) {
      return textReply(
        JSON.stringify({
          confidence: 0.92,
          steps: [{ capability: scenario.idealCapability, args: {} }],
        }),
      );
    }

    if (params.tools?.length && scenario.expectedPrimaryTool) {
      const allowed = params.tools.map((t) => t.name);
      const tool = allowed.includes(scenario.expectedPrimaryTool)
        ? scenario.expectedPrimaryTool
        : allowed[0];
      return toolReply(tool ?? "read_calendar", {});
    }

    return textReply("Magnus reply for the user.");
  };
}
