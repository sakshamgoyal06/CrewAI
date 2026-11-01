/**
 * Helpers for accuracy-suite orchestrator fixture runs (no hoisted state).
 */
import type {
  MagnusRoutingCapability,
  ParkedFeatureTopic,
  RoutingContextSignals,
} from "../agents/routing/routingContextParser.js";
import { NEUTRAL_ROUTING_CONTEXT } from "../agents/routing/routingContextParser.js";
import type { GoldenPathScenario } from "./goldenPathScenarios.js";
import type { MagnusAccuracyOrchestratorCase } from "./magnusAccuracySuite.types.js";

function parkedTopicFromCategory(category: string): ParkedFeatureTopic | null {
  switch (category) {
    case "parked_meals":
      return "meals";
    case "parked_wealth":
      return "wealth";
    case "parked_notion":
      return "notion";
    case "parked_happiness":
      return "happiness";
    case "parked_wisdom":
      return "wisdom";
    default:
      return null;
  }
}

/** Fixture parser signals — mirrors routingContextParser output for accuracy runs. */
export function parserSignalsForAccuracyCase(
  scenario: GoldenPathScenario | MagnusAccuracyOrchestratorCase | null,
): RoutingContextSignals {
  if (!scenario) {
    return { ...NEUTRAL_ROUTING_CONTEXT };
  }

  const parked = parkedTopicFromCategory(scenario.category);
  const signals: RoutingContextSignals = {
    ...NEUTRAL_ROUTING_CONTEXT,
    parked_feature_topic: parked,
  };

  if (parked === "meals") {
    signals.explicit_meal_log = true;
    signals.prefer_intent_health = true;
  }
  if (scenario.category === "health_fitness") {
    signals.looks_like_health_fitness_read = true;
    signals.prefer_intent_health = true;
  }
  if (scenario.idealCapability === "day_overview") {
    signals.holistic_day_ask = true;
  }
  const capabilityToMagnusRouting: Partial<Record<string, MagnusRoutingCapability>> = {
    calendar: "calendar",
    event_log: "event_log",
    reminders: "reminders",
    lists: "lists",
    youtube: "youtube",
  };
  const magnusCap = capabilityToMagnusRouting[scenario.idealCapability];
  if (magnusCap) {
    signals.looks_like_magnus_tool_action = true;
    signals.magnus_capabilities = [magnusCap];
  }

  return signals;
}

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
