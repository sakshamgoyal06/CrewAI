import type { RoutingChatTurn } from "../routing/magnusToolContinuation.js";
import type { RoutingRecentTurn } from "./types.js";

const ROUTING_TURN_MAX_CHARS = 420;

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)}…`;
}

function toolsFromMetadata(meta: Record<string, unknown> | null | undefined): string[] | undefined {
  const tools = meta?.tools_used;
  if (!Array.isArray(tools)) {
    return undefined;
  }
  const names = tools
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter((t) => t.length > 0);
  return names.length > 0 ? names : undefined;
}

/** Map DB chat rows to routing turns with classifier-useful metadata. */
export function normalizeRoutingRecentTurns(turns: RoutingChatTurn[]): RoutingRecentTurn[] {
  return turns.map((t) => {
    const meta = t.metadata ?? null;
    const role = t.role === "assistant" ? "assistant" : "user";
    const intent =
      typeof meta?.intent === "string"
        ? meta.intent
        : typeof meta?.agent_metadata === "object" &&
            meta.agent_metadata &&
            typeof (meta.agent_metadata as { intent?: unknown }).intent === "string"
          ? String((meta.agent_metadata as { intent: string }).intent)
          : null;
    const delegatedAgent =
      typeof meta?.delegated_agent === "string" ? meta.delegated_agent : null;

    return {
      role,
      content: truncate(typeof t.content === "string" ? t.content : "", ROUTING_TURN_MAX_CHARS),
      intent,
      delegatedAgent,
      toolsUsed: toolsFromMetadata(meta),
    };
  });
}
