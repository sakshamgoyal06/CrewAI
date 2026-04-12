import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import {
  gatherResearchMaterials,
  type ResearchGatherDeps,
} from "../../tools/research/index.js";
import { anthropic } from "../../tools/clients.js";
import { SPECIALIST_USER_IDENTITY } from "../promptIdentity.js";
import type { AgentContext, AgentResult } from "../types.js";
import { wantsResearchDepth } from "./researchRouting.js";

const MODEL = "claude-sonnet-4-6";

export const RESEARCH_SYSTEM = `You are the Research agent for Magnus (Intelligence department).

${SPECIALIST_USER_IDENTITY}

Scope: Deep dives, competitive scans, article or paper summaries. Cite sources; distinguish fact vs inference; end with actionable takeaways and open questions.

You will receive gathered web excerpts and/or pasted text. Use that material for factual claims when present; you may add careful general knowledge and label it as such.

Output Markdown with EXACTLY these sections and headings:

## Executive answer
(Short direct answer.)

## Key points
- Bullet points only.

## Sources
- **Title** — URL — one-line relevance.
(Include every URL from the gathered materials list. If no pages were fetched and no URLs exist, write: *No external pages fetched — answer uses pasted text or general knowledge only.*)

## Open questions / risks
- Bullet points only.

Tone: precise, kind, no hype. If evidence is thin, say so.`;

function textFromMessage(msg: Message): string {
  for (const block of msg.content) {
    if (block.type === "text") {
      return block.text;
    }
  }
  return "";
}

function buildUserBlock(ctx: AgentContext, gather: Awaited<ReturnType<typeof gatherResearchMaterials>>): string {
  const lines: string[] = [`User question:\n${ctx.rawMessage.trim()}`];
  if (gather.searchQuery) {
    lines.push(`\nWeb search query used (optional): ${gather.searchQuery}`);
  }
  if (gather.pastedExcerpt) {
    lines.push(`\n--- Pasted text (excerpt) ---\n${gather.pastedExcerpt}`);
  }
  if (gather.sources.length > 0) {
    lines.push("\n--- Gathered pages ---");
    for (const s of gather.sources) {
      lines.push(
        `\n### ${s.title}\nURL: ${s.url}\nExcerpt:\n${s.excerpt}\n`,
      );
    }
  } else {
    lines.push("\n--- Gathered pages ---\n(none)");
  }
  if (ctx.memoryBlock?.trim()) {
    lines.push(
      `\n--- Magnus memory (internal context; not user text) ---\n${ctx.memoryBlock.trim()}`,
    );
  }
  return lines.join("\n");
}

export type ResearchAgentDeps = {
  gather?: typeof gatherResearchMaterials;
  model?: string;
};

export async function runResearchAgent(
  ctx: AgentContext,
  deps: ResearchAgentDeps & ResearchGatherDeps = {},
): Promise<AgentResult> {
  const gatherFn = deps.gather ?? gatherResearchMaterials;
  const { fetchImpl, fetchTimeoutMs, maxResponseBytes, maxUrls } = deps;
  const gather = await gatherFn(ctx.rawMessage, {
    fetchImpl,
    fetchTimeoutMs,
    maxResponseBytes,
    maxUrls,
  });

  const depth = wantsResearchDepth(ctx.rawMessage);
  const maxTokens = depth ? 2048 : 1024;
  const userBlock = buildUserBlock(ctx, gather);

  const msg = await anthropic.messages.create({
    model: deps.model ?? MODEL,
    max_tokens: maxTokens,
    system: RESEARCH_SYSTEM,
    messages: [{ role: "user", content: userBlock }],
  });

  const text = textFromMessage(msg).trim() || "…";
  return {
    text,
    metadata: {
      specialist: "Research",
      department: ctx.intent,
      ...(ctx.pillar !== undefined ? { pillar: ctx.pillar } : {}),
      ...(ctx.department !== undefined
        ? { routing_department: ctx.department }
        : {}),
      research_sources_count: gather.sources.length,
      research_had_pasted: Boolean(gather.pastedExcerpt),
      research_search_query: gather.searchQuery ?? null,
    },
  };
}
