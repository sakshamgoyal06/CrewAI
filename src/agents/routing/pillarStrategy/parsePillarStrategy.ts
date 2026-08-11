import { anthropic } from "../../../tools/clients.js";
import { logger } from "../../../logger.js";
import { loggableError } from "../../../util/loggableError.js";
import {
  formatCatalogForPrompt,
  getCapabilityCatalog,
  isValidCapability,
} from "./catalogs/index.js";
import type { PillarExecutionPlan, PillarId, PillarPlanStep, RoutingHints } from "./types.js";
import { planFromSingleCapability } from "./types.js";

const PARSER_MODEL = process.env.MAGNUS_PILLAR_STRATEGY_MODEL?.trim() || "claude-haiku-4-5";

const MAX_PLAN_STEPS = Math.min(
  Math.max(Number.parseInt(process.env.MAGNUS_PILLAR_PLAN_MAX_STEPS ?? "4", 10) || 4, 1),
  8,
);

type RawPlanJson = {
  confidence?: number;
  capability?: string;
  args?: unknown;
  steps?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parsePlanJson(text: string): RawPlanJson | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as RawPlanJson;
  } catch {
    return null;
  }
}

function normalizeStep(raw: unknown, pillar: PillarId): PillarPlanStep | null {
  const row = asRecord(raw);
  if (!row || typeof row.capability !== "string") {
    return null;
  }
  const capability = row.capability.trim();
  if (!isValidCapability(pillar, capability)) {
    return null;
  }
  const args = asRecord(row.args) ?? {};
  const intent_summary =
    typeof row.intent_summary === "string" && row.intent_summary.trim()
      ? row.intent_summary.trim()
      : undefined;
  return { capability, args, ...(intent_summary ? { intent_summary } : {}) };
}

function normalizePlan(parsed: RawPlanJson, pillar: PillarId): PillarExecutionPlan | null {
  const confidence =
    typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0.5;

  if (Array.isArray(parsed.steps) && parsed.steps.length > 0) {
    const steps: PillarPlanStep[] = [];
    for (const raw of parsed.steps.slice(0, MAX_PLAN_STEPS)) {
      const step = normalizeStep(raw, pillar);
      if (step) {
        steps.push(step);
      }
    }
    if (steps.length === 0) {
      return null;
    }
    return { steps, confidence, parser: "llm" };
  }

  if (parsed.capability && isValidCapability(pillar, parsed.capability)) {
    const args = asRecord(parsed.args) ?? {};
    return planFromSingleCapability(parsed.capability, args, confidence, "llm");
  }

  return null;
}

function buildSystemPrompt(pillar: PillarId): string {
  const catalog = getCapabilityCatalog(pillar);
  const sharedRules = `You are the **${pillar} request parser** for Magnus. You do NOT see user profile, meal history, or memory — only the current message, routing hints, and recent turn previews.

Your job: produce an **ordered execution plan** — one or more steps. Each step picks one capability id, optional structured args, and a short intent_summary (what this step should accomplish).

Capabilities:
${formatCatalogForPrompt(catalog)}

Rules:
- Output ONLY valid JSON, no markdown.
- "steps" is an array of 1–${MAX_PLAN_STEPS} objects: { "capability", "args", "intent_summary" }.
- Each capability MUST be from the list above.
- "confidence" is 0.0–1.0 for the whole plan.
- Single clear intent → one step. Multiple distinct actions ("and also", "then", comma-separated tool asks) → multiple steps in logical order.
- READ before WRITE when order matters (e.g. show plan, then shopping list).
- Use the **entire user message** plus **recent_turns** and **routing_hints** together — interpret meaning; do not keyword-match in code.
- Do NOT duplicate the same capability unless the user explicitly asked twice.

Shape:
{"confidence":0.9,"steps":[{"capability":"id","args":{},"intent_summary":"brief sub-request"}]}`;

  if (pillar === "GENERAL") {
    return `${sharedRules}

GENERAL-specific:
- **day_overview** when the user wants the **whole day** — calendar, schedule, commitments, and meals together. Examples: "what does my day/tomorrow look like", "entire day tomorrow", "what's on tomorrow", "walk me through Monday". Pass date_hint in args when clear: "today", "tomorrow", "yesterday", or YYYY-MM-DD.
- **lists** when the user sends a **photo of items to save** (routing_hints.photo_purpose=list_items) — add detected titles from photo_extracted_items to the list they asked for (readlist, watchlist, etc.) using recent_turns for which list.
- **pillar_consultation** when the turn needs Magnus tools AND pillar specialist depth in one reply. Set args.pillars to subset of ["HEALTH","WEALTH","HAPPINESS","WISDOM"]. Examples: log check-in + review workout, calendar edit + nutrition advice, list update + portfolio context.
- **calendar** only when they want Google Calendar / schedule **without** also wanting meals and commitments woven in.
- Holistic day asks are NEVER satisfied by conversation alone — use day_overview.
- Use routing_hints integration flags (google_calendar_connected, etc.) — if calendar not connected, day_overview still runs but calendar section may be empty.
- **project_setup** when starting or **clearly continuing** a bounded initiative draft (lock, revise checklist, confirm scope). Also when user starts job search / trip / transformation / skill sprint / event planning. NOT for daily gym, meals, calendar, or day_overview — **active_project_session=true does NOT hijack operations**. If the user asks about tomorrow's schedule, gym, or meals while a draft exists, use day_overview / calendar / HEALTH — abandon is handled separately before this parser runs.
- **project_status** when user asks progress on an active project ("how's job search", "what's left on Bali").
- **project_manage** when pausing, completing, abandoning, or reprioritizing an **existing locked project** (must exist in active_projects). NOT for locking a draft session.
- **goal_manage** when setting a long-horizon SMART goal without a project wrapper.`;
  }

  if (pillar === "HEALTH") {
    return `${sharedRules}

HEALTH-specific — meal plan vs meal log (never mix):
- **meal_log** / **meal_log_photo** / **meal_log_correct**: food the user **ate** — writes meal_logs; only these count toward daily calorie totals.
- **meal_plan_create** / **meal_plan_read** / skip / swap / templates / shopping: **planned menu only** — meal_plan_entries; titles and slots, NOT daily totals. Do not use meal_log for "what's planned" or "plan my week".
- **meal_history** / **meal_breakdown** / **meal_day_breakdown** / **meal_history_undo**: read or undo **logged** meals only (meal_logs). meal_day_breakdown = full-day logged summary. Never include meal_plan_entries or planned menus in calorie totals.
- When the user describes **future** meals ("I'll eat", "will be", "today breakfast ill eat"), use **meal_plan_create** — NOT meal_log.
- **meal_log_photo** only when routing_hints.has_meal_photo=true AND photo_purpose=meal_log (food/drink to log). Non-food photos must NOT use meal_log_photo even if a photo is attached.
- When has_meal_photo=true and photo_purpose is list_items, document, receipt, etc. → **generic_ack** (wrong pillar; orchestrator should have routed elsewhere).
- **meal_plan_read**: user wants to see what is already **locked/saved** — "what's my meal plan", "what am I eating tomorrow", "show planned meals" (food only). Pass **date_hint** per step: "today", "tomorrow", "yesterday", or YYYY-MM-DD. Multi-day asks ("today and tomorrow") → one step per day with the correct date_hint each.
- **meal_plan_create**: build/draft a NEW plan OR continue an in-progress session (active_meal_plan_session=true): gather, draft, review, cancel, save, revisions, and Q&A **about the draft meal plan shown in recent turns**.
- active_meal_plan_session=true → meal_plan_create **only** when the user is continuing the planning journey or asking about the **draft menu** — NOT when they ask for a holistic day/schedule (calendar + full day). Those belong to GENERAL day_overview; if you only see a holistic day ask, use generic_ack.
- previous_turn_meal_plan_locked=true + no active session + food-only view ask → **meal_plan_read**, NOT create.
- Meal corrections after a recent log → meal_log_correct (check previous_turn_was_meal_log).
- **meal_plan_swap** edits the locked plan: pass **new_title** to replace one slot, or **exchange_with_slot** with **slot** to switch two slots (e.g. lunch ↔ dinner). Use **date_hint** when not today.
- **meal_plan_skip** skips a slot — pass **slot** and optional **date_hint** in args.`;
  }

  return sharedRules;
}

function fallbackPlan(pillar: PillarId): PillarExecutionPlan {
  const defaults: Record<PillarId, string> = {
    HEALTH: "generic_ack",
    WEALTH: "coaching",
    HAPPINESS: "coaching",
    WISDOM: "coaching",
    GENERAL: "conversation",
  };
  return planFromSingleCapability(defaults[pillar], {}, 0, "deterministic");
}

/**
 * LLM parser: message + hints only — no user data. Returns an ordered execution plan.
 */
export async function parsePillarExecutionPlan(
  pillar: PillarId,
  userMessage: string,
  hints: RoutingHints,
): Promise<PillarExecutionPlan> {
  const userPayload = JSON.stringify(
    {
      message: userMessage.trim(),
      routing_hints: hints,
    },
    null,
    2,
  );

  try {
    const msg = await anthropic.messages.create({
      model: PARSER_MODEL,
      max_tokens: 512,
      system: buildSystemPrompt(pillar),
      messages: [{ role: "user", content: userPayload }],
    });

    for (const block of msg.content) {
      if (block.type !== "text") {
        continue;
      }
      const parsed = parsePlanJson(block.text);
      if (!parsed) {
        continue;
      }
      const plan = normalizePlan(parsed, pillar);
      if (plan) {
        return plan;
      }
    }
  } catch (e) {
    logger.warn({ err: loggableError(e), pillar }, "pillar execution plan parser failed");
  }

  return fallbackPlan(pillar);
}

/** @deprecated Use parsePillarExecutionPlan */
export const parsePillarStrategy = parsePillarExecutionPlan;

/** @deprecated Legacy env toggle removed — pillar strategy parser is always on. */
export function pillarStrategyEnabled(): boolean {
  return true;
}

export function pillarPlanComposeEnabled(): boolean {
  const raw = process.env.MAGNUS_PILLAR_PLAN_COMPOSE?.trim().toLowerCase();
  if (raw === "false" || raw === "0") {
    return false;
  }
  return true;
}
