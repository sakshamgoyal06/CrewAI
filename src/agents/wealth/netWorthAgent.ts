import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { anthropic, supabase } from "../../tools/clients.js";
import { augmentUserWithMemory } from "../memory/memoryAgent.js";
import { SPECIALIST_USER_IDENTITY } from "../promptIdentity.js";
import type { AgentContext, AgentResult } from "../types.js";

const MODEL = "claude-sonnet-4-6";

const SNAPSHOT_ROW_LIMIT = 5;

/**
 * Net worth & balance sheet — conceptual framing (Wealth pillar). Not bookkeeping software.
 */
export const NET_WORTH_SYSTEM = `You are the Net Worth specialist for Magnus within LifeOS (Wealth pillar).

${SPECIALIST_USER_IDENTITY}

Scope: Help the user think in **plain language** about their **balance sheet picture** — what counts as an **asset** (things that add to net worth) vs a **liability** (what you owe), without pretending to be accounting software. Explain **conceptual drift**: how a mental model of net worth can slowly get out of sync with reality (forgotten accounts, rough estimates, life changes) and why that matters for decisions. Encourage **reconciliation habits**: light, repeatable check-ins (e.g. periodic roll-ups, sanity checks, noting what changed) rather than obsessive tracking.

Hard limits (must follow):
- You are **not** a substitute for an accountant, bookkeeper, or tax professional. Do **not** give jurisdiction-specific tax, legal, or compliance guidance as definitive.
- Do **not** give personalised financial advice that replaces a licensed professional who knows the user’s full situation. Encourage **qualified professionals** when they need binding numbers or filings.

Optional context may be appended by the system (north star, timezone, or read-only snapshot rows from Magnus data). Use it when present; if absent or empty, proceed from the user’s message without mentioning missing data.

Keep replies focused; default to roughly 200 words or less unless the user asks for more detail.`;

function textFromMessage(msg: Message): string {
  for (const block of msg.content) {
    if (block.type === "text") {
      return block.text;
    }
  }
  return "";
}

function optionalProfileBlock(ctx: AgentContext): string {
  const parts: string[] = [];
  if (ctx.northStarGoal?.trim()) {
    parts.push(`North star (from profile): ${ctx.northStarGoal.trim()}`);
  }
  if (ctx.timezone?.trim()) {
    parts.push(`Timezone (from profile): ${ctx.timezone.trim()}`);
  }
  if (parts.length === 0) {
    return "";
  }
  return `\n\n${parts.join("\n")}`;
}

/**
 * Best-effort read-only rows from `portfolio_snapshots` when the table exists and RLS/service role allows.
 * Any failure → empty string (caller still answers from the user message).
 */
async function optionalPortfolioSnapshotsBlock(userProfileId: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("portfolio_snapshots")
      .select("*")
      .eq("user_profile_id", userProfileId)
      .limit(SNAPSHOT_ROW_LIMIT);

    if (error || !data?.length) {
      return "";
    }

    const serialized = data.map((row, i) => `Row ${i + 1}: ${JSON.stringify(row)}`).join("\n");
    return `\n\nOptional read-only context (portfolio_snapshots, up to ${SNAPSHOT_ROW_LIMIT} rows; may be incomplete):\n${serialized}`;
  } catch {
    return "";
  }
}

export async function runNetWorthAgent(ctx: AgentContext): Promise<AgentResult> {
  const profileBlock = optionalProfileBlock(ctx);
  const snapshotsBlock = await optionalPortfolioSnapshotsBlock(ctx.userProfileId);
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 768,
    system: NET_WORTH_SYSTEM,
    messages: [
      {
        role: "user",
        content: augmentUserWithMemory(
          `${ctx.rawMessage}${profileBlock}${snapshotsBlock}`,
          ctx.memoryBlock,
        ),
      },
    ],
  });
  const text = textFromMessage(msg).trim() || "…";
  return {
    text,
    metadata: {
      specialist: "NetWorth",
      pillar: "wealth",
      department: "net_worth",
      departmentIntent: "WEALTH",
    },
  };
}
