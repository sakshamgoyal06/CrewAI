/**
 * Multi-turn meal planning journey: gather → draft → review → lock.
 */
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { anthropic } from "../../tools/clients.js";
import { localDateKey, timezoneAbbrev } from "../localDate.js";
import { offsetDateKey } from "../parseMealPlanJson.js";
import { extractMealPlanJson, stripMealPlanJsonBlock } from "../parseMealPlanJson.js";
import { savePlanEntries } from "../store/mealPlanStore.js";
import type { AgentContext, AgentResult } from "../../agents/types.js";
import { HEALTH_SPECIALIST_MODEL } from "../../agents/health/model.js";
import {
  abandonMealPlanSession,
  createMealPlanSession,
  getActiveMealPlanSession,
  lockMealPlanSession,
  updateMealPlanSession,
  type MealPlanSessionRow,
} from "./mealPlanningSessionStore.js";
import { parsePlanningHorizon } from "./parsePlanningHorizon.js";
import {
  defaultSlotsFromTimingNotes,
  formatSlotsLabel,
  parsePlanningSlots,
  type PlannedSlot,
} from "./parsePlanningSlots.js";
import {
  MEAL_PLAN_DRAFT_SYSTEM,
  buildDraftUserPrompt,
} from "./mealPlanningPrompt.js";
import { buildSpecialistIdentity } from "../../agents/promptIdentity.js";
import { fetchUserHealthProfile } from "../../agents/health/healthOnboarding.js";

const CANCEL_RE =
  /\b(?:cancel\s+(?:planning|plan)|never\s*mind|stop\s+planning|abort\s+plan)\b/i;

const LOCK_RE =
  /^(?:yes|yep|yeah|save(?:\s+it|\s+plan|\s+the\s+plan)?|lock(?:\s+it|\s+plan|\s+the\s+plan)?|looks?\s+good|perfect|go\s+ahead|confirm|ship\s+it|that\s+works)\b/i;

const SKIP_RE = /^(?:skip|nothing\s+special|no(?:thing)?\s+different|same\s+as\s+usual)\.?$/i;

function textFromMessage(msg: Message): string {
  for (const block of msg.content) {
    if (block.type === "text") {
      return block.text;
    }
  }
  return "";
}

function planAnchorBlock(ctx: AgentContext): string {
  const today = localDateKey(new Date(), ctx.timezone);
  const tz = timezoneAbbrev(ctx.timezone);
  return `Today is **${today}** (${tz}).`;
}

function flowMeta(session: MealPlanSessionRow, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    specialist: "MealPlanner",
    department: "nutrition",
    pillar: "health",
    sub_kind: "meal_plan",
    meal_plan_session_id: session.id,
    meal_plan_step: session.step,
    meal_plan_status: session.status,
    ...extra,
  };
}

async function generateDraft(
  ctx: AgentContext,
  session: MealPlanSessionRow,
  revisionNotes: string | null,
): Promise<
  | { ok: true; display: string; entries: NonNullable<ReturnType<typeof extractMealPlanJson>> }
  | { ok: false; error: string }
> {
  if (!session.horizon_start || !session.horizon_end) {
    return { ok: false, error: "horizon not set" };
  }

  const msg = await anthropic.messages.create({
    model: HEALTH_SPECIALIST_MODEL,
    max_tokens: 2048,
    system: `${buildSpecialistIdentity(ctx)}\n\n${MEAL_PLAN_DRAFT_SYSTEM}`,
    messages: [
      {
        role: "user",
        content: buildDraftUserPrompt({
          horizonStart: session.horizon_start,
          horizonEnd: session.horizon_end,
          slots: session.slots,
          constraintsText: session.constraints_text,
          healthPreferences: ctx.healthPreferences ?? null,
          revisionNotes,
          previousDraftDisplay: session.draft_display,
          anchorBlock: planAnchorBlock(ctx),
        }),
      },
    ],
  });

  const llmText = textFromMessage(msg).trim();
  const entries = extractMealPlanJson(llmText);
  if (!entries?.length) {
    return { ok: false, error: "draft JSON missing" };
  }

  const display = stripMealPlanJsonBlock(llmText) || llmText;
  return { ok: true, display, entries };
}

async function persistDraft(
  session: MealPlanSessionRow,
  display: string,
  entries: NonNullable<ReturnType<typeof extractMealPlanJson>>,
  revisionNotes: string | null,
): Promise<{ ok: true; session: MealPlanSessionRow } | { ok: false; error: string }> {
  const updated = await updateMealPlanSession(session.id, {
    status: "draft",
    step: "review",
    draft_entries: entries,
    draft_display: display,
    revision_notes: revisionNotes,
  });
  if (!updated.ok) {
    return updated;
  }
  return {
    ok: true,
    session: {
      ...session,
      status: "draft",
      step: "review",
      draft_entries: entries,
      draft_display: display,
      revision_notes: revisionNotes,
    },
  };
}

function reviewPrompt(session: MealPlanSessionRow): string {
  const range =
    session.horizon_start === session.horizon_end
      ? session.horizon_start
      : `${session.horizon_start} → ${session.horizon_end}`;

  return [
    session.draft_display?.trim() ?? "(draft)",
    "",
    `**Draft plan** for ${range} (${formatSlotsLabel(session.slots)}).`,
    "",
    "Reply **save plan** to lock this menu, or tell me what to change (e.g. more protein, simpler dinners, swap Tuesday lunch).",
    "Say **cancel planning** to discard.",
  ].join("\n");
}

async function handleReviewStep(
  ctx: AgentContext,
  session: MealPlanSessionRow,
  raw: string,
): Promise<AgentResult> {
  if (LOCK_RE.test(raw.trim())) {
    if (!session.draft_entries.length) {
      return {
        text: "No draft to save yet — I'll rebuild one. What should change?",
        metadata: flowMeta(session, { meal_plan_saved: false }),
      };
    }

    const saved = await savePlanEntries(ctx.userProfileId, session.draft_entries, "chat");
    if (!saved.ok) {
      return {
        text: `Could not lock plan: ${saved.error}`,
        metadata: flowMeta(session, { meal_plan_saved: false, error: saved.error }),
      };
    }

    await lockMealPlanSession(session.id);

    const dateRange =
      saved.dates.length === 1
        ? saved.dates[0]
        : `${saved.dates[0]} → ${saved.dates[saved.dates.length - 1]}`;

    return {
      text: [
        `**Plan locked** — ${saved.savedCount} meal(s) saved for ${dateRange}.`,
        "",
        "I'll use this for reminders, adherence nudges, and log matching. Say **show my meal plan** anytime.",
      ].join("\n"),
      metadata: flowMeta(session, {
        meal_plan_saved: true,
        meal_plan_locked: true,
        saved_count: saved.savedCount,
        plan_dates: saved.dates,
      }),
    };
  }

  const draft = await generateDraft(ctx, session, raw.trim());
  if (!draft.ok) {
    return {
      text: `I couldn't revise the draft (${draft.error}). Try shorter feedback or say **save plan** if the current draft works.`,
      metadata: flowMeta(session, { meal_plan_saved: false }),
    };
  }

  const next = await persistDraft(session, draft.display, draft.entries, raw.trim());
  if (!next.ok) {
    return {
      text: `Draft ready but couldn't save session: ${next.error}`,
      metadata: flowMeta(session, { meal_plan_saved: false }),
    };
  }

  return {
    text: reviewPrompt(next.session),
    metadata: flowMeta(next.session, { meal_plan_revised: true }),
  };
}

async function advanceToDraft(
  ctx: AgentContext,
  session: MealPlanSessionRow,
): Promise<AgentResult> {
  const draft = await generateDraft(ctx, session, null);
  if (!draft.ok) {
    return {
      text: `I hit a snag building the draft (${draft.error}). Check your horizon/slots or try again.`,
      metadata: flowMeta(session, { meal_plan_saved: false }),
    };
  }

  const next = await persistDraft(session, draft.display, draft.entries, null);
  if (!next.ok) {
    return {
      text: `Draft built but session update failed: ${next.error}`,
      metadata: flowMeta(session, { meal_plan_saved: false }),
    };
  }

  return {
    text: reviewPrompt(next.session),
    metadata: flowMeta(next.session, { meal_plan_drafted: true }),
  };
}

async function handleConstraintsStep(
  ctx: AgentContext,
  session: MealPlanSessionRow,
  raw: string,
): Promise<AgentResult> {
  const constraints = SKIP_RE.test(raw.trim()) ? null : raw.trim();
  const updated = await updateMealPlanSession(session.id, {
    step: "constraints",
    constraints_text: constraints,
  });
  if (!updated.ok) {
    return {
      text: `Could not save notes: ${updated.error}`,
      metadata: flowMeta(session),
    };
  }

  return advanceToDraft(ctx, {
    ...session,
    constraints_text: constraints,
    step: "constraints",
  });
}

async function handleSlotsStep(
  ctx: AgentContext,
  session: MealPlanSessionRow,
  raw: string,
  healthRow: Awaited<ReturnType<typeof fetchUserHealthProfile>>,
): Promise<AgentResult> {
  const parsed = parsePlanningSlots(raw);
  const slots: PlannedSlot[] =
    SKIP_RE.test(raw.trim())
      ? defaultSlotsFromTimingNotes(healthRow?.meal_timing_notes)
      : (parsed ?? defaultSlotsFromTimingNotes(healthRow?.meal_timing_notes));

  const updated = await updateMealPlanSession(session.id, {
    step: "constraints",
    slots,
  });
  if (!updated.ok) {
    return {
      text: `Could not save slots: ${updated.error}`,
      metadata: flowMeta(session),
    };
  }

  const nextSession = { ...session, slots, step: "constraints" as const };

  const constraintsFromMessage =
    raw.trim().length > 20 && !parsed ? raw.trim() : null;
  if (constraintsFromMessage && SKIP_RE.test(constraintsFromMessage)) {
    return advanceToDraft(ctx, nextSession);
  }

  if (constraintsFromMessage && !parsePlanningSlots(raw)) {
    await updateMealPlanSession(session.id, {
      constraints_text: constraintsFromMessage,
      step: "constraints",
    });
    return advanceToDraft(ctx, {
      ...nextSession,
      constraints_text: constraintsFromMessage,
    });
  }

  return {
    text: [
      `Got it — **${formatSlotsLabel(slots)}** each day.`,
      "",
      "**Anything special this stretch?** (travel, eating out, batch prep, budget, cuisines to favor/avoid — or say **skip**.)",
    ].join("\n"),
    metadata: flowMeta(nextSession, { meal_plan_step: "constraints" }),
  };
}

async function handleHorizonStep(
  ctx: AgentContext,
  session: MealPlanSessionRow,
  raw: string,
  healthRow: Awaited<ReturnType<typeof fetchUserHealthProfile>>,
): Promise<AgentResult> {
  const today = localDateKey(new Date(), ctx.timezone);
  const horizon = parsePlanningHorizon(raw, today);

  if (!horizon) {
    return {
      text: [
        "**How long should we plan?**",
        "",
        "Examples: **today**, **tomorrow**, **this week**, **next 7 days**, or **2026-08-12 to 2026-08-18**.",
      ].join("\n"),
      metadata: flowMeta(session, { meal_plan_step: "horizon" }),
    };
  }

  const updated = await updateMealPlanSession(session.id, {
    step: "slots",
    horizon_start: horizon.startDate,
    horizon_end: horizon.endDate,
  });
  if (!updated.ok) {
    return {
      text: `Could not save dates: ${updated.error}`,
      metadata: flowMeta(session),
    };
  }

  const nextSession = {
    ...session,
    horizon_start: horizon.startDate,
    horizon_end: horizon.endDate,
    step: "slots" as const,
  };

  const parsedSlots = parsePlanningSlots(raw);
  if (parsedSlots) {
    await updateMealPlanSession(session.id, { slots: parsedSlots, step: "slots" });
    nextSession.slots = parsedSlots;
    nextSession.step = "slots";

    const hasConstraints =
      raw.length > 40 &&
      !/\b(?:today|tomorrow|week|days?)\b/i.test(raw.slice(0, 30));
    if (hasConstraints) {
      return handleConstraintsStep(ctx, nextSession, raw);
    }

    return {
      text: [
        `Planning **${horizon.label}** (${horizon.startDate} → ${horizon.endDate}).`,
        "",
        "**Which meals each day?** Default is breakfast, lunch, dinner — say **add snacks**, **dinners only**, or **skip** for default.",
      ].join("\n"),
      metadata: flowMeta(nextSession, { meal_plan_step: "slots" }),
    };
  }

  const defaultSlots = defaultSlotsFromTimingNotes(healthRow?.meal_timing_notes);
  await updateMealPlanSession(session.id, { slots: defaultSlots });

  return {
    text: [
      `Planning **${horizon.label}** (${horizon.startDate} → ${horizon.endDate}).`,
      "",
      "**Which meals each day?** Default is breakfast, lunch, dinner — say **add snacks**, **dinners only**, or **skip** for default.",
    ].join("\n"),
    metadata: flowMeta(nextSession, { meal_plan_step: "slots" }),
  };
}

/** Fast-path: rich first message → skip straight to draft when horizon is clear. */
function tryFastPathConstraints(raw: string, today: string): {
  horizon: ReturnType<typeof parsePlanningHorizon>;
  constraints: string | null;
} | null {
  const horizon = parsePlanningHorizon(raw, today);
  if (!horizon) {
    return null;
  }
  const stripped = raw
    .replace(/\b(?:meal\s+plan(?:ning)?|plan\s+my\s+meals|weekly\s+menu|menu\s+for)\b/gi, "")
    .replace(/\b(?:today|tomorrow|this\s+week|next\s+\d+\s+days?|for\s+the\s+week)\b/gi, "")
    .trim();

  return {
    horizon,
    constraints: stripped.length > 8 ? stripped : null,
  };
}

export async function runMealPlanningTurn(
  ctx: AgentContext,
  existingSession: MealPlanSessionRow | null,
): Promise<AgentResult> {
  const raw = ctx.rawMessage.trim();

  if (CANCEL_RE.test(raw)) {
    if (existingSession) {
      await abandonMealPlanSession(existingSession.id);
    }
    return {
      text: "Meal planning cancelled. Your last locked plan (if any) is unchanged.",
      metadata: {
        specialist: "MealPlanner",
        meal_plan_cancelled: true,
      },
    };
  }

  let session = existingSession;
  if (!session) {
    const created = await createMealPlanSession(ctx.userProfileId);
    if (!created.ok) {
      return {
        text: `Could not start planning session: ${created.error}`,
        metadata: { specialist: "MealPlanner", meal_plan_error: created.error },
      };
    }
    session = created.session;
  }

  const healthRow = await fetchUserHealthProfile(ctx.userProfileId);

  if (session.step === "review" || session.status === "draft") {
    return handleReviewStep(ctx, session, raw);
  }

  if (session.step === "constraints") {
    return handleConstraintsStep(ctx, session, raw);
  }

  if (session.step === "slots") {
    return handleSlotsStep(ctx, session, raw, healthRow);
  }

  const today = localDateKey(new Date(), ctx.timezone);
  const fast =
    session.step === "horizon" ? tryFastPathConstraints(raw, today) : null;
  if (fast?.horizon && fast.constraints) {
    const slots = parsePlanningSlots(raw) ?? defaultSlotsFromTimingNotes(healthRow?.meal_timing_notes);
    await updateMealPlanSession(session.id, {
      horizon_start: fast.horizon.startDate,
      horizon_end: fast.horizon.endDate,
      slots,
      constraints_text: fast.constraints,
      step: "constraints",
    });
    return advanceToDraft(ctx, {
      ...session,
      horizon_start: fast.horizon.startDate,
      horizon_end: fast.horizon.endDate,
      slots,
      constraints_text: fast.constraints,
      step: "constraints",
    });
  }

  if (session.step === "horizon") {
    return handleHorizonStep(ctx, session, raw, healthRow);
  }

  return handleHorizonStep(ctx, session, raw, healthRow);
}

export function mealPlanningIntro(): string {
  const today = localDateKey(new Date(), undefined);
  const weekEnd = offsetDateKey(today, 6);
  return [
    "Let's build a meal plan together — I'll ask a few quick questions, show a **draft**, and only save when you say **save plan**.",
    "",
    "**Step 1 — How long?** (today / tomorrow / this week / next 7 days / custom dates)",
    "",
    `_Example: "this week, high protein vegetarian, batch prep dinners"_`,
    `_Anchor: ${today} → ${weekEnd}_`,
  ].join("\n");
}
