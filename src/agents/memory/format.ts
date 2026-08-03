import { formatInstant } from "../../events/eventTime.js";
import type { MemoryRetrievalProfile } from "./adaptiveRetrieval.js";
import { memoryConfig } from "./memoryConfig.js";
import type { MemoryContext, MemoryEventEntry } from "./types.js";

export type FormatMemoryBlockOptions = {
  semanticFacts?: string[];
  /** When true, omit chat snippets (history is in `messages[]`). */
  omitChatSnippets?: boolean;
};

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

/** One commitment as a line: when, what, where it stands. No ids — acting on one needs a tool. */
function eventLine(entry: MemoryEventEntry, fallbackTimeZone: string): string {
  const tz = entry.timeZone || fallbackTimeZone || "UTC";
  const when = entry.plannedStartAt
    ? formatInstant(new Date(entry.plannedStartAt), tz, { dateOnly: entry.allDay })
    : "no time set";
  const pillar = entry.pillar ? ` [${entry.pillar}]` : "";
  const moved = entry.moves && entry.moves > 0 ? `, moved ${entry.moves}×` : "";
  const why = entry.reason?.trim() ? ` — ${entry.reason.trim()}` : "";
  return `- ${when} ${entry.title}${pillar} (${entry.status}${moved})${why}`;
}

/**
 * Structured non-chat context: profile, goals, logs, semantic facts, rolling DB summaries.
 */
export function formatMemoryBlockForSystem(
  ctx: MemoryContext,
  profile?: MemoryRetrievalProfile,
  options: FormatMemoryBlockOptions = {},
): string {
  const config = memoryConfig();
  const maxChars = profile?.memoryBlockMaxChars ?? config.memoryBlockMaxChars;
  const parts: string[] = [];

  if (ctx.profile?.displayName?.trim()) {
    parts.push(`User: ${ctx.profile.displayName.trim().slice(0, 80)}`);
  }
  if (ctx.profile?.northStarGoal?.trim()) {
    parts.push(`North star: ${ctx.profile.northStarGoal.trim().slice(0, 400)}`);
  }
  if (ctx.profile?.timezone?.trim()) {
    parts.push(`Timezone: ${ctx.profile.timezone.trim()}`);
  }
  if (ctx.profile?.userTier?.trim()) {
    parts.push(`Tier: ${ctx.profile.userTier.trim()}`);
  }

  const includeEvents = profile?.includeEvents ?? true;
  const includeDailyScores = profile?.includeDailyScores ?? true;
  const includeDailyLogs = profile?.includeDailyLogs ?? true;
  const includeGoals = profile?.includeGoals ?? true;
  const includeJoy = profile?.includeJoy ?? true;
  const includePatterns = profile?.includePatterns ?? true;
  const includeRolling = profile?.includeRollingSummaries ?? true;
  const includeGaps = profile?.includeGaps ?? config.includeGapsInBlock;
  const includeChatSnippets =
    (profile?.includeChatSnippetsInBlock ?? false) && !options.omitChatSnippets;

  if (includeEvents && ctx.recentSignals.events && ctx.recentSignals.events.length > 0) {
    const tz = ctx.profile?.timezone?.trim() || "UTC";
    const lines = ctx.recentSignals.events
      .slice(0, config.eventsInBlock)
      .map((e) => eventLine(e, tz));
    parts.push(
      `Commitments around today (event log — planned, done, missed, moved):\n${lines.join("\n")}`,
    );
  }

  if (includeDailyScores && ctx.recentSignals.dailyScores && ctx.recentSignals.dailyScores.length > 0) {
    parts.push(
      `Recent daily scores (raw sample): ${JSON.stringify(ctx.recentSignals.dailyScores.slice(0, 2)).slice(0, 700)}`,
    );
  }

  if (includeDailyLogs && ctx.recentSignals.dailyLogs && ctx.recentSignals.dailyLogs.length > 0) {
    const lines = ctx.recentSignals.dailyLogs
      .slice(0, config.dailyLogsInBlock)
      .map((d) => {
        const day = d.logDate ? `${d.logDate} ` : "";
        const src = d.source ? `[${d.source}] ` : "";
        const snip = d.body.slice(0, config.dailyLogSnippetChars);
        const ell = d.body.length > config.dailyLogSnippetChars ? "…" : "";
        return `- ${day}${src}${snip}${ell}`;
      });
    parts.push(`Recent Magnus daily logs (newest first):\n${lines.join("\n")}`);
  }

  if (options.semanticFacts && options.semanticFacts.length > 0) {
    const lines = options.semanticFacts.map((f) => {
      const snip = f.slice(0, config.semanticFactSnippetChars);
      const ell = f.length > config.semanticFactSnippetChars ? "…" : "";
      return `- ${snip}${ell}`;
    });
    parts.push(`Remembered facts about this user:\n${lines.join("\n")}`);
  }

  if (includeChatSnippets && ctx.recentSignals.recentChatTurns.length > 0) {
    const lines = ctx.recentSignals.recentChatTurns.slice(0, 8).map((t) => {
      const snippet = t.content.slice(0, 160);
      const ell = t.content.length > 160 ? "…" : "";
      const intent = t.intent ? ` [${t.intent}]` : "";
      return `- (${t.role}${intent}) ${snippet}${ell}`;
    });
    parts.push(`Recent chat (truncated, newest first):\n${lines.join("\n")}`);
  }

  if (includeRolling && ctx.rollingSummaries.summary7d?.trim()) {
    parts.push(
      `7d summary: ${ctx.rollingSummaries.summary7d.trim().slice(0, config.rollingSummarySnippetChars)}`,
    );
  }
  if (includeRolling && ctx.rollingSummaries.summary30d?.trim()) {
    parts.push(
      `30d summary: ${ctx.rollingSummaries.summary30d.trim().slice(0, config.rollingSummarySnippetChars)}`,
    );
  }

  if (includeGoals && ctx.activeGoals.length > 0) {
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

  if (ctx.lists) {
    const listParts: string[] = [];
    listParts.push(
      `Notion: ${ctx.lists.notionConnected ? "connected (optional mirror)" : "not connected — lists work in Supabase"}`,
    );
    const withOpen = ctx.lists.catalog.filter((c) => c.openCount > 0);
    if (withOpen.length > 0) {
      const lines = withOpen
        .slice(0, 10)
        .map((c) => `- ${c.slug}: ${c.openCount} open${c.notionLinked ? " (notion)" : ""}`);
      listParts.push(`Lists with open items:\n${lines.join("\n")}`);
    }
    if (ctx.lists.openHighlights.length > 0) {
      const lines = ctx.lists.openHighlights.slice(0, 10).map((h) => {
        const st = h.status ? ` [${h.status}]` : "";
        return `- ${h.slug}: ${h.title}${st}`;
      });
      listParts.push(`Open list highlights:\n${lines.join("\n")}`);
    }
    listParts.push("Use list_items (open_only) before recommending — do not invent list rows.");
    parts.push(listParts.join("\n"));
  }

  if (includeJoy && ctx.joy.summary?.trim()) {
    parts.push(`Joy / happiness: ${ctx.joy.summary.trim().slice(0, 500)}`);
  }
  if (
    includeJoy &&
    ctx.joy.happinessReserve &&
    Object.keys(ctx.joy.happinessReserve).length > 0
  ) {
    parts.push(
      `Happiness reserve (raw): ${JSON.stringify(ctx.joy.happinessReserve).slice(0, 500)}`,
    );
  }

  if (includePatterns && ctx.patterns.length > 0) {
    parts.push(`Patterns (sample): ${JSON.stringify(ctx.patterns.slice(0, 3)).slice(0, 600)}`);
  }

  if (includeGaps && ctx.gaps.length > 0) {
    parts.push(`Data gaps: ${ctx.gaps.join("; ")}`);
  }

  const out = parts.filter(Boolean).join("\n\n");
  return out.length > maxChars ? `${out.slice(0, maxChars)}…` : out;
}
