/**
 * Ensures assistant replies do not claim writes/saves unless metadata proves they happened.
 */
export type ToolOutcome = {
  name: string;
  ok: boolean;
  preview: string;
};

export type ActionIntegrityInput = {
  text: string;
  metadata?: Record<string, unknown>;
};

export type ActionIntegrityResult = {
  text: string;
  metadata: Record<string, unknown>;
  corrected: boolean;
  reason?: string;
};

const READ_ONLY_TOOLS = new Set([
  "read_calendar",
  "list_catalog",
  "list_items",
  "recommend_list_items",
  "get_daily_checkin",
  "list_events",
  "list_lifeos_goals",
  "list_notion_items",
  "youtube_search",
  "youtube_recommend",
]);

const WRITE_CLAIM_RE =
  /\b(?:I've|I have|I'?ve) (?:added|logged|saved|created|scheduled|booked|removed|deleted|updated|mirrored|set up|linked|connected)\b|\b(?:added|logged|saved|created|scheduled|booked|removed|deleted|updated|mirrored)\b(?:\s+\S+){0,8}\s+(?:to|on|in)\b|\b(?:added|logged|saved|created|scheduled|booked|removed|deleted|updated|mirrored)\b|\blogging .{0,50} now\b|\b(?:all done|done ✅)\b|\b(?:mirrored to notion|also saved to)\b|\b(?:is|are) now (?:on|in|linked|connected|clean|empty|live)\b|^`checkin:/im;

const FULL_COMPLETION_RE =
  /\b(?:all done|everything(?:'s| is) (?:set|saved|logged|updated)|fully (?:logged|saved|updated)|clean at \d+|is now clean)\b/i;

const MISLEADING_LINE_RE =
  /^(?:added|logged|saved|created|scheduled|all done|done)\b|^`checkin:/i;

const TOOL_FAILURE_RE =
  /^(?:Could not\b|Tool error:|Unknown tool:|Nothing to log|Invalid\b|You're not\b|No lists yet|Check-ins list is not available|Title is required|date must be|Unknown list\b|Item .+ not found)/i;

/** Classify a Magnus tool return string as success vs failure. */
export function classifyToolResult(output: string): boolean {
  const trimmed = output.trim();
  if (!trimmed) {
    return false;
  }
  return !TOOL_FAILURE_RE.test(trimmed);
}

export function claimsPersistence(text: string): boolean {
  return WRITE_CLAIM_RE.test(text.trim());
}

function isReadOnlyTool(name: string): boolean {
  return READ_ONLY_TOOLS.has(name);
}

function hasSpecialistWriteEvidence(meta: Record<string, unknown>): boolean {
  if (meta.journal_saved === true) {
    return true;
  }
  if (meta.meal_log === true) {
    return true;
  }
  if (meta.hevy_write === true) {
    return true;
  }
  if (meta.meal_plan_saved === true || meta.meal_plan_locked === true) {
    return true;
  }
  return false;
}

function isMealPlanDraftReply(meta: Record<string, unknown>): boolean {
  return (
    meta.specialist === "MealPlanner" &&
    (meta.meal_plan_status === "draft" ||
      meta.meal_plan_revised === true ||
      meta.meal_plan_drafted === true ||
      meta.meal_plan_question === true)
  );
}

function toolOutcomes(meta: Record<string, unknown>): ToolOutcome[] {
  const raw = meta.tool_outcomes;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (row): row is ToolOutcome =>
      typeof row === "object" &&
      row !== null &&
      typeof (row as ToolOutcome).name === "string" &&
      typeof (row as ToolOutcome).ok === "boolean",
  );
}

export function hasSuccessfulWriteTool(meta: Record<string, unknown>): boolean {
  if (hasSpecialistWriteEvidence(meta)) {
    return true;
  }

  const outcomes = toolOutcomes(meta);
  if (outcomes.length > 0) {
    return outcomes.some((o) => o.ok && !isReadOnlyTool(o.name));
  }

  const toolsUsed = meta.tools_used;
  if (Array.isArray(toolsUsed)) {
    return toolsUsed.some((name) => typeof name === "string" && !isReadOnlyTool(name));
  }

  return false;
}

function hasFailedWriteTool(meta: Record<string, unknown>): boolean {
  const outcomes = toolOutcomes(meta);
  return outcomes.some((o) => !o.ok && !isReadOnlyTool(o.name));
}

export function stripMisleadingClaimLines(text: string): string {
  const kept = text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return true;
      }
      if (MISLEADING_LINE_RE.test(trimmed)) {
        return false;
      }
      if (/\blogging .{0,40} now\b/i.test(trimmed)) {
        return false;
      }
      return true;
    });
  return kept.join("\n").trim();
}

function buildHonestReply(input: {
  prefix: string;
  body: string;
  suffix: string;
}): string {
  const core = input.body.trim() || "I can help with that, but nothing was saved yet.";
  return `${input.prefix}${core}${input.suffix}`;
}

/**
 * Rewrite replies that claim persistence without evidence, or that overstate partial tool runs.
 */
export function enforceActionIntegrity(input: ActionIntegrityInput): ActionIntegrityResult {
  const meta = { ...(input.metadata ?? {}) };
  const text = input.text.trim();
  if (!text) {
    return { text, metadata: meta, corrected: false };
  }

  if (isMealPlanDraftReply(meta)) {
    return { text, metadata: meta, corrected: false };
  }

  if (meta.tool_limit === true && claimsPersistence(text) && FULL_COMPLETION_RE.test(text)) {
    const cleaned = stripMisleadingClaimLines(text);
    return {
      text: buildHonestReply({
        prefix: "I only got partway through that request. ",
        body:
          cleaned ||
          'Say "continue" and I will pick up where I left off, or ask for one smaller step.',
        suffix: "",
      }),
      metadata: {
        ...meta,
        action_integrity: "tool_limit_partial",
        action_integrity_original_claim: true,
      },
      corrected: true,
      reason: "tool_limit_partial",
    };
  }

  if (!claimsPersistence(text)) {
    return { text, metadata: meta, corrected: false };
  }

  if (hasSuccessfulWriteTool(meta)) {
    if (hasFailedWriteTool(meta) && !meta.action_integrity_warned) {
      return {
        text: `${text}\n\n_(Note: one or more save steps failed — tell me what still looks wrong and I will fix it.)_`,
        metadata: { ...meta, action_integrity: "partial_write_failure", action_integrity_warned: true },
        corrected: true,
        reason: "partial_write_failure",
      };
    }
    return { text, metadata: meta, corrected: false };
  }

  const promptOnly = meta.prompt_only === true;
  const prefix = promptOnly
    ? "I haven't saved anything — I can only advise from here. "
    : "I haven't actually saved that yet. ";
  const suffix = " Tell me again in one message what to log or add and I'll handle it.";

  return {
    text: buildHonestReply({
      prefix,
      body: stripMisleadingClaimLines(text),
      suffix,
    }),
    metadata: {
      ...meta,
      action_integrity: promptOnly ? "prompt_only_claim" : "no_write_evidence",
      action_integrity_original_claim: true,
    },
    corrected: true,
    reason: promptOnly ? "prompt_only_claim" : "no_write_evidence",
  };
}
