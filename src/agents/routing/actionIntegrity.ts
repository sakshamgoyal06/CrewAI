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

const FIRST_PERSON_WRITE_RE =
  /\b(?:I've|I have|I'?ve) (?:added|logged|saved|created|scheduled|booked|removed|deleted|updated|mirrored|set up|linked|connected)\b/i;

/** e.g. "Added X to watchlist", "Saved template to library" */
const ACTION_TO_TARGET_RE =
  /\b(?:added|logged|saved|created|scheduled|booked|removed|deleted|updated|mirrored)\b(?:\s+\S+){0,8}\s+(?:to|on|in)\b/i;

/** e.g. "Saved template **name**", "Logged daily check-in" at line start */
const LINE_START_ACTION_RE =
  /^(?:added|logged|saved|created|scheduled|booked|removed|deleted|updated|mirrored)\b/im;

const OTHER_WRITE_CLAIM_RE =
  /\blogging .{0,50} now\b|\b(?:logged|saved|added) as\b|\b(?:all done|done ✅)\b|\b(?:mirrored to notion|also saved to)\b|\b(?:is|are) now (?:on|in|linked|connected|clean|empty|live)\b|^`checkin:/im;

/** Descriptive/negative uses — not assistant write claims. */
const NEGATED_WRITE_CONTEXT_RE =
  /\b(?:no|not|nothing|none|without|haven't|hasn't|don't|didn't|isn't|aren't|wasn't|weren't|un(?:saved|logged|scheduled|updated|locked))\b[^.\n]{0,48}\b(?:added|logged|saved|created|scheduled|booked|removed|deleted|updated|mirrored|locked)\b/i;

const FULL_COMPLETION_RE =
  /\b(?:all done|everything(?:'s| is) (?:set|saved|logged|updated)|fully (?:logged|saved|updated)|clean at \d+|is now clean)\b/i;

const CALENDAR_SYNC_CLAIM_RE =
  /\b(?:calendar (?:event )?(?:is )?(?:live|set|updated|synced)|(?:added|put)\s+(?:it\s+)?(?:to|on)\s+(?:your\s+)?calendar|on your calendar)\b/i;

const CALENDAR_WRITE_TOOLS = new Set([
  "create_calendar_event",
  "update_calendar_event",
  "delete_calendar_event",
]);

/** User request was satisfied without a new write (duplicate, already on list, read-only check). */
const REQUEST_ALREADY_SATISFIED_RE =
  /\b(?:already (?:on|in) (?:your )?(?:\w+list|list)|(?:is|was) already (?:on|there|in|your)|no duplicates? needed|nothing (?:new )?to add|didn'?t need to (?:add|save)|found (?:it )?(?:was )?already|you(?:'d| had) added (?:it )?before|added (?:it )?(?:at some point |before|previously|earlier))\b/i;

/** Past-tense / historical mention of a prior add — not a claim that this turn saved. */
const HISTORICAL_ADD_RE =
  /\b(?:you(?:'ve| had)?|they|someone|it was) (?:added|saved|logged)\b|\badded (?:it )?(?:at some point|before|previously|earlier)\b/i;

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
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (REQUEST_ALREADY_SATISFIED_RE.test(trimmed) && !FIRST_PERSON_WRITE_RE.test(trimmed)) {
    return false;
  }
  const looksLikeWriteClaim =
    FIRST_PERSON_WRITE_RE.test(trimmed) ||
    ACTION_TO_TARGET_RE.test(trimmed) ||
    LINE_START_ACTION_RE.test(trimmed) ||
    OTHER_WRITE_CLAIM_RE.test(trimmed);
  if (!looksLikeWriteClaim) {
    return false;
  }
  if (NEGATED_WRITE_CONTEXT_RE.test(trimmed)) {
    return false;
  }
  if (HISTORICAL_ADD_RE.test(trimmed) && !FIRST_PERSON_WRITE_RE.test(trimmed)) {
    return false;
  }
  return true;
}

/** True when the reply (or step outcome) shows the user's ask was met without a new write. */
export function requestAlreadySatisfied(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  return REQUEST_ALREADY_SATISFIED_RE.test(trimmed);
}

function isReadOnlyTool(name: string): boolean {
  return READ_ONLY_TOOLS.has(name);
}

function hasSpecialistWriteEvidence(meta: Record<string, unknown>): boolean {
  if (meta.journal_saved === true) {
    return true;
  }
  if (meta.meal_log === true) {
    if (typeof meta.meal_session_id === "string" && meta.meal_session_id.trim()) {
      return true;
    }
    const sessionIds = meta.meal_session_ids;
    if (Array.isArray(sessionIds) && sessionIds.some((id) => typeof id === "string" && id.trim())) {
      return true;
    }
    return false;
  }
  if (meta.hevy_write === true) {
    return true;
  }
  if (meta.meal_plan_saved === true || meta.meal_plan_locked === true) {
    return true;
  }
  if (meta.project_locked === true && typeof meta.project_id === "string" && meta.project_id.trim()) {
    return true;
  }
  if (
    typeof meta.project_session_id === "string" &&
    meta.project_session_id.trim() &&
    meta.project_setup === true &&
    meta.project_locked !== true
  ) {
    return true;
  }
  const mealPlanTag = meta.meal_plan;
  if (
    typeof mealPlanTag === "string" &&
    ["template_saved", "template_applied", "copied", "skipped", "swapped"].includes(mealPlanTag)
  ) {
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

/** Draft project setup — session persisted; no locked project row expected this turn. */
function isProjectSetupDraftReply(meta: Record<string, unknown>): boolean {
  if (meta.project_locked === true) {
    return false;
  }
  if (meta.project_setup_draft === true || meta.project_setup === true) {
    if (typeof meta.project_session_id === "string" && meta.project_session_id.trim()) {
      return true;
    }
  }
  const results = meta.pillar_step_results;
  if (!Array.isArray(results)) {
    return false;
  }
  return results.some((row) => {
    if (!row || typeof row !== "object") {
      return false;
    }
    const capability = (row as { capability?: unknown }).capability;
    const preview = (row as { preview?: unknown }).preview;
    return (
      capability === "project_setup" &&
      typeof preview === "string" &&
      /\b(?:lock it in|done when:)\b/i.test(preview)
    );
  });
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

function hasSuccessfulCalendarWrite(meta: Record<string, unknown>): boolean {
  if (typeof meta.google_event_id === "string" && meta.google_event_id.trim()) {
    return true;
  }
  if (meta.calendar_synced === true) {
    return true;
  }
  return toolOutcomes(meta).some((o) => o.ok && CALENDAR_WRITE_TOOLS.has(o.name));
}

function claimsCalendarSync(text: string): boolean {
  return CALENDAR_SYNC_CLAIM_RE.test(text.trim());
}

function hasFailedWriteTool(meta: Record<string, unknown>): boolean {
  const outcomes = toolOutcomes(meta);
  return outcomes.some((o) => !o.ok && !isReadOnlyTool(o.name));
}

function stepResultsIndicateNoWriteNeeded(meta: Record<string, unknown>): boolean {
  const results = meta.pillar_step_results;
  if (!Array.isArray(results)) {
    return false;
  }
  return results.some((row) => {
    if (!row || typeof row !== "object") {
      return false;
    }
    const preview = (row as { preview?: unknown }).preview;
    return typeof preview === "string" && requestAlreadySatisfied(preview);
  });
}

function onlyReadToolsSucceeded(meta: Record<string, unknown>): boolean {
  const outcomes = toolOutcomes(meta);
  if (outcomes.length === 0) {
    return false;
  }
  return outcomes.every((o) => o.ok && isReadOnlyTool(o.name));
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

  if (isProjectSetupDraftReply(meta)) {
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
    const stripped = stripMisleadingClaimLines(text);
    if (
      stripped !== text &&
      (requestAlreadySatisfied(stripped) || stepResultsIndicateNoWriteNeeded(meta))
    ) {
      return {
        text: stripped,
        metadata: { ...meta, action_integrity: "stripped_false_add_line" },
        corrected: true,
        reason: "stripped_false_add_line",
      };
    }
    if (claimsCalendarSync(text) && !hasSuccessfulCalendarWrite(meta)) {
      return {
        text: stripMisleadingClaimLines(text).replace(
          CALENDAR_SYNC_CLAIM_RE,
          "event log updated",
        ),
        metadata: {
          ...meta,
          action_integrity: "calendar_claim_without_sync",
          action_integrity_original_claim: true,
        },
        corrected: true,
        reason: "calendar_claim_without_sync",
      };
    }
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

  const stripped = stripMisleadingClaimLines(text);
  const satisfiedWithoutWrite =
    requestAlreadySatisfied(text) ||
    requestAlreadySatisfied(stripped) ||
    stepResultsIndicateNoWriteNeeded(meta) ||
    (onlyReadToolsSucceeded(meta) && requestAlreadySatisfied(stripped || text));

  if (satisfiedWithoutWrite) {
    return {
      text: stripped || text,
      metadata: { ...meta, action_integrity: "no_write_needed" },
      corrected: stripped !== text,
      reason: stripped !== text ? "stripped_false_add_line" : undefined,
    };
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
