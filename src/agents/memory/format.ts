import type { MemoryContext } from "./types.js";

const DEFAULT_MAX_BLOCK = 2200;

/**
 * Appends a labeled memory section to the user message for Claude (specialists / GENERAL).
 */
export function augmentUserWithMemory(
  rawMessage: string,
  memoryBlock?: string,
): string {
  if (!memoryBlock?.trim()) {
    return rawMessage;
  }
  return `${rawMessage.trim()}\n\n--- Magnus memory (internal context; not user text) ---\n${memoryBlock.trim()}`;
}

/**
 * Compact string for system-side injection (or user-message augmentation).
 */
export function formatMemoryBlockForSystem(
  ctx: MemoryContext,
  maxChars: number = DEFAULT_MAX_BLOCK,
): string {
  const parts: string[] = [];

  if (ctx.profile?.northStarGoal?.trim()) {
    parts.push(`North star: ${ctx.profile.northStarGoal.trim().slice(0, 400)}`);
  }
  if (ctx.profile?.timezone?.trim()) {
    parts.push(`Timezone: ${ctx.profile.timezone.trim()}`);
  }
  if (ctx.profile?.userTier?.trim()) {
    parts.push(`Tier: ${ctx.profile.userTier.trim()}`);
  }

  if (ctx.recentSignals.dailyScores && ctx.recentSignals.dailyScores.length > 0) {
    parts.push(
      `Recent daily scores (raw sample): ${JSON.stringify(ctx.recentSignals.dailyScores.slice(0, 2)).slice(0, 700)}`,
    );
  }

  if (ctx.recentSignals.dailyLogs && ctx.recentSignals.dailyLogs.length > 0) {
    const lines = ctx.recentSignals.dailyLogs.slice(0, 6).map((d) => {
      const day = d.logDate ? `${d.logDate} ` : "";
      const src = d.source ? `[${d.source}] ` : "";
      const snip = d.body.slice(0, 220);
      const ell = d.body.length > 220 ? "…" : "";
      return `- ${day}${src}${snip}${ell}`;
    });
    parts.push(`Recent Magnus daily logs (newest first):\n${lines.join("\n")}`);
  }

  if (ctx.recentSignals.recentChatTurns.length > 0) {
    const lines = ctx.recentSignals.recentChatTurns.slice(0, 8).map((t) => {
      const snippet = t.content.slice(0, 160);
      const ell = t.content.length > 160 ? "…" : "";
      const intent = t.intent ? ` [${t.intent}]` : "";
      return `- (${t.role}${intent}) ${snippet}${ell}`;
    });
    parts.push(`Recent chat (truncated, newest first):\n${lines.join("\n")}`);
  }

  if (ctx.rollingSummaries.summary7d?.trim()) {
    parts.push(`7d summary: ${ctx.rollingSummaries.summary7d.trim().slice(0, 600)}`);
  }
  if (ctx.rollingSummaries.summary30d?.trim()) {
    parts.push(`30d summary: ${ctx.rollingSummaries.summary30d.trim().slice(0, 600)}`);
  }

  if (ctx.activeGoals.length > 0) {
    const gl = ctx.activeGoals
      .slice(0, 8)
      .map((g) =>
        [g.label, g.pillar ? `(${g.pillar})` : "", g.status ? `[${g.status}]` : ""]
          .filter(Boolean)
          .join(" "),
      )
      .join("; ");
    parts.push(`Active goals: ${gl}`);
  }

  if (ctx.joy.summary?.trim()) {
    parts.push(`Joy / happiness: ${ctx.joy.summary.trim().slice(0, 500)}`);
  }
  if (ctx.joy.happinessReserve && Object.keys(ctx.joy.happinessReserve).length > 0) {
    parts.push(`Happiness reserve (raw): ${JSON.stringify(ctx.joy.happinessReserve).slice(0, 500)}`);
  }

  if (ctx.patterns.length > 0) {
    parts.push(`Patterns (sample): ${JSON.stringify(ctx.patterns.slice(0, 3)).slice(0, 600)}`);
  }

  if (ctx.gaps.length > 0) {
    parts.push(`Data gaps: ${ctx.gaps.join("; ")}`);
  }

  if (!ctx.semanticRecallAvailable) {
    parts.push("Semantic recall: not available (embeddings / pgvector not wired).");
  }

  const out = parts.filter(Boolean).join("\n\n");
  return out.length > maxChars ? `${out.slice(0, maxChars)}…` : out;
}
