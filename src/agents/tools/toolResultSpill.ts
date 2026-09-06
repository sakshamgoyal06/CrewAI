/**
 * Step 3 — spill large tool outputs to Redis; return compact handle to the model loop.
 * Full body retrieved via internal `read_tool_artifact` (not in user-facing catalog).
 */
import { randomUUID } from "node:crypto";

import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { redis as defaultRedis } from "../../tools/clients.js";
import { logger } from "../../logger.js";
import { loggableError } from "../../util/loggableError.js";

export type ToolResultSpillConfig = {
  enabled: boolean;
  spillChars: number;
  previewChars: number;
  readChunkChars: number;
  ttlSeconds: number;
};

const REDIS_PREFIX = "magnus:tool_artifact:";

type StoredArtifact = {
  toolName: string;
  body: string;
  createdAt: string;
};

let cachedConfig: ToolResultSpillConfig | null = null;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  if (raw === "true" || raw === "1" || raw === "yes") {
    return true;
  }
  if (raw === "false" || raw === "0" || raw === "no") {
    return false;
  }
  return fallback;
}

export function toolResultSpillConfig(): ToolResultSpillConfig {
  if (cachedConfig) {
    return cachedConfig;
  }
  cachedConfig = {
    enabled: envBool("MAGNUS_TOOL_RESULT_SPILL_ENABLED", true),
    spillChars: envInt("MAGNUS_TOOL_RESULT_SPILL_CHARS", 4000),
    previewChars: envInt("MAGNUS_TOOL_RESULT_SPILL_PREVIEW_CHARS", 800),
    readChunkChars: envInt("MAGNUS_TOOL_RESULT_READ_CHUNK_CHARS", 4000),
    ttlSeconds: envInt("MAGNUS_TOOL_RESULT_ARTIFACT_TTL_SEC", 86_400),
  };
  return cachedConfig;
}

export function resetToolResultSpillConfigForTests(): void {
  cachedConfig = null;
}

function artifactKey(userProfileId: string, artifactId: string): string {
  return `${REDIS_PREFIX}${userProfileId}:${artifactId}`;
}

/** Rough item count for spilled summaries (calendar lines, list rows). */
export function estimateToolResultItemCount(output: string, toolName: string): number {
  const bulletLines = output.match(/^- /gm);
  if (bulletLines && bulletLines.length > 0) {
    return bulletLines.length;
  }
  if (toolName.includes("list") || toolName === "list_events") {
    const numbered = output.match(/^\d+\./gm);
    if (numbered && numbered.length > 0) {
      return numbered.length;
    }
  }
  if (toolName === "read_calendar") {
    const ids = output.match(/\[id: [^\]]+\]/g);
    if (ids && ids.length > 0) {
      return ids.length;
    }
  }
  return output.split("\n").filter((line) => line.trim().length > 0).length;
}

export type SpillHandle = {
  spilled: true;
  artifact_id: string;
  tool: string;
  preview: string;
  count: number;
  total_chars: number;
  hint: string;
};

export function formatSpillHandle(input: {
  artifactId: string;
  toolName: string;
  rawOutput: string;
  previewChars: number;
}): string {
  const preview =
    input.rawOutput.length <= input.previewChars
      ? input.rawOutput
      : `${input.rawOutput.slice(0, input.previewChars)}…`;
  const handle: SpillHandle = {
    spilled: true,
    artifact_id: input.artifactId,
    tool: input.toolName,
    preview,
    count: estimateToolResultItemCount(input.rawOutput, input.toolName),
    total_chars: input.rawOutput.length,
    hint: "Use read_tool_artifact(artifact_id) for the full body or a slice (offset_chars, max_chars).",
  };
  return JSON.stringify(handle);
}

type RedisLike = {
  set: (
    key: string,
    value: string,
    opts?: { ex?: number },
  ) => Promise<unknown>;
  get: (key: string) => Promise<string | null>;
};

export async function persistToolArtifact(
  userProfileId: string,
  toolName: string,
  body: string,
  deps: { redis?: RedisLike } = {},
): Promise<string> {
  const sb = deps.redis ?? defaultRedis;
  const config = toolResultSpillConfig();
  const artifactId = randomUUID();
  const payload: StoredArtifact = {
    toolName,
    body,
    createdAt: new Date().toISOString(),
  };
  await sb.set(artifactKey(userProfileId, artifactId), JSON.stringify(payload), {
    ex: config.ttlSeconds,
  });
  return artifactId;
}

/** When output exceeds threshold, persist and return compact JSON handle. */
export async function maybeSpillToolResult(input: {
  userProfileId: string;
  toolName: string;
  rawOutput: string;
  deps?: { redis?: RedisLike };
}): Promise<string> {
  const config = toolResultSpillConfig();
  if (!config.enabled || input.rawOutput.length <= config.spillChars) {
    return input.rawOutput;
  }

  try {
    const artifactId = await persistToolArtifact(
      input.userProfileId,
      input.toolName,
      input.rawOutput,
      input.deps,
    );
    return formatSpillHandle({
      artifactId,
      toolName: input.toolName,
      rawOutput: input.rawOutput,
      previewChars: config.previewChars,
    });
  } catch (e) {
    logger.warn(
      { err: loggableError(e), tool: input.toolName, userProfileId: input.userProfileId },
      "tool result spill failed — returning truncated inline preview",
    );
    return `${input.rawOutput.slice(0, config.spillChars)}… [truncated — spill storage unavailable]`;
  }
}

export async function readToolArtifact(input: {
  userProfileId: string;
  artifactId: string;
  offsetChars?: number;
  maxChars?: number;
  deps?: { redis?: RedisLike };
}): Promise<string> {
  const config = toolResultSpillConfig();
  const sb = input.deps?.redis ?? defaultRedis;
  const raw = await sb.get(artifactKey(input.userProfileId, input.artifactId.trim()));
  if (!raw) {
    return `Artifact not found or expired: ${input.artifactId}`;
  }

  let stored: StoredArtifact;
  try {
    stored = JSON.parse(raw) as StoredArtifact;
  } catch {
    return `Artifact ${input.artifactId} is corrupted.`;
  }

  const body = typeof stored.body === "string" ? stored.body : "";
  const offset = Math.max(0, input.offsetChars ?? 0);
  const max = Math.max(1, input.maxChars ?? config.readChunkChars);
  if (offset >= body.length) {
    return `Artifact ${input.artifactId}: offset ${offset} is past end (${body.length} chars).`;
  }

  const slice = body.slice(offset, offset + max);
  const hasMore = offset + max < body.length;
  const header = `[artifact ${input.artifactId} · tool=${stored.toolName} · chars ${offset}-${offset + slice.length} of ${body.length}]`;
  return hasMore
    ? `${header}\n${slice}\n… (${body.length - offset - slice.length} chars remain — call read_tool_artifact with offset_chars=${offset + slice.length})`
    : `${header}\n${slice}`;
}

/** Internal loop tool — never expose in capability catalog or default allowlists. */
export const READ_TOOL_ARTIFACT: Tool = {
  name: "read_tool_artifact",
  description:
    "Internal: load full output when a prior tool result was spilled (JSON with artifact_id). Use for event ids or list rows not shown in preview.",
  input_schema: {
    type: "object",
    properties: {
      artifact_id: { type: "string", description: "From spilled tool result." },
      offset_chars: {
        type: "number",
        description: "Character offset into the stored body. Default 0.",
      },
      max_chars: {
        type: "number",
        description: "Max characters to return. Default 4000.",
      },
    },
    required: ["artifact_id"],
  },
};

export function appendInternalLoopTools<T extends Tool>(tools: T[]): T[] {
  if (!toolResultSpillConfig().enabled) {
    return tools;
  }
  if (tools.some((t) => "name" in t && t.name === READ_TOOL_ARTIFACT.name)) {
    return tools;
  }
  return [...tools, READ_TOOL_ARTIFACT as T];
}

/** Approximate tokens for CI budget gates (chars / 4). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
