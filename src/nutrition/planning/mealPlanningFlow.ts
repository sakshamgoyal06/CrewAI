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
  lockMealPlanSession,
  updateMealPlanSession,
  type MealPlanSessionRow,
} from "./mealPlanningSessionStore.js";
import { parsePlanningHorizon, listDatesInHorizon } from "./parsePlanningHorizon.js";
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
import { loadFoodListContext, syncLockedPlanToFoodList } from "./foodListEnrichment.js";
import { isFullLockCommand, parsePartialLockDates } from "./parsePartialLock.js";
import { MEAL_PLAN_CANCEL_RE, sanitizeMealPlanningUserMessage } from "./mealPlanningRouting.js";
import type { MealPlanEntryInput } from "../parseMealPlanJson.js";
import { buildSpecialistIdentity } from "../../agents/promptIdentity.js";
import { fetchUserHealthProfile } from "../../agents/health/healthOnboarding.js";

const CANCEL_RE = MEAL_PLAN_CANCEL_RE;

const LOCK_RE = isFullLockCommand;

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

function chunkHorizonDates(startDate: string, endDate: string, chunkSize = 7): string[][] {
  const dates = listDatesInHorizon(startDate, endDate);
  const chunks: string[][] = [];
  for (let i = 0; i < dates.length; i += chunkSize) {
    chunks.push(dates.slice(i, i + chunkSize));
  }
  return chunks;
}

async function maybeRefreshHorizonFromMessage(
  session: MealPlanSessionRow,
  raw: string,
  timezone?: string,
): Promise<MealPlanSessionRow> {
  const today = localDateKey(new Date(), timezone);
  const horizon = parsePlanningHorizon(raw, today);
  if (!horizon) {
    return session;
  }
  if (
    horizon.startDate === session.horizon_start &&
    horizon.endDate === session.horizon_end
  ) {
    return session;
  }
  const updated = await updateMealPlanSession(session.id, {
    horizon_start: horizon.startDate,
    horizon_end: horizon.endDate,
  });
  if (!updated.ok) {
    return session;
  }
  return {
    ...session,
    horizon_start: horizon.startDate,
    horizon_end: horizon.endDate,
  };
}

async function generateDraftOnce(
  ctx: AgentContext,
  session: MealPlanSessionRow,
  revisionNotes: string | null,
  attempt = 0,
): Promise<
  | { ok: true; display: string; entries: NonNullable<ReturnType<typeof extractMealPlanJson>> }
  | { ok: false; error: string; llmText?: string }
> {
  if (!session.horizon_start || !session.horizon_end) {
    return { ok: false, error: "horizon not set" };
  }

  const dayCount = listDatesInHorizon(session.horizon_start, session.horizon_end).length;
  const slotCount = Math.max(session.slots.length, 1);
  const maxTokens = Math.min(8192, 1024 + dayCount * slotCount * 80);

  const userPrompt = buildDraftUserPrompt({
    horizonStart: session.horizon_start,
    horizonEnd: session.horizon_end,
    slots: session.slots,
    constraintsText: session.constraints_text,
    healthPreferences: ctx.healthPreferences ?? null,
    revisionNotes,
    previousDraftDisplay: session.draft_display,
    anchorBlock: planAnchorBlock(ctx),
    foodListContext: await loadFoodListContext(ctx.userProfileId),
  });

  const jsonNudge =
    attempt > 0
      ? "\n\n**Required:** End with a fenced ```json block containing ALL entries for every date and slot. No prose after the JSON."
      : "";

  const msg = await anthropic.messages.create({
    model: HEALTH_SPECIALIST_MODEL,
    max_tokens: maxTokens,
    system: `${buildSpecialistIdentity(ctx)}\n\n${MEAL_PLAN_DRAFT_SYSTEM}`,
    messages: [{ role: "user", content: `${userPrompt}${jsonNudge}` }],
  });

  const llmText = textFromMessage(msg).trim();
  const entries = extractMealPlanJson(llmText);
  if (!entries?.length) {
    if (attempt < 2) {
      return generateDraftOnce(ctx, session, revisionNotes, attempt + 1);
    }
    return { ok: false, error: "draft JSON missing", llmText };
  }

  const display = stripMealPlanJsonBlock(llmText) || llmText;
  return { ok: true, display, entries };
}

async function generateDraftJsonRecovery(
  session: MealPlanSessionRow,
  priorDisplay: string,
): Promise<
  | { ok: true; display: string; entries: NonNullable<ReturnType<typeof extractMealPlanJson>> }
  | { ok: false; error: string }
> {
  if (!session.horizon_start || !session.horizon_end) {
    return { ok: false, error: "horizon not set" };
  }

  const dates = listDatesInHorizon(session.horizon_start, session.horizon_end);
  const slotCount = Math.max(session.slots.length, 1);
  const maxTokens = Math.min(8192, 512 + dates.length * slotCount * 48);

  const msg = await anthropic.messages.create({
    model: HEALTH_SPECIALIST_MODEL,
    max_tokens: maxTokens,
    system:
      "Return ONLY a fenced ```json block with shape {\"entries\":[{\"local_date\":\"YYYY-MM-DD\",\"meal_slot\":\"breakfast|lunch|dinner|snack\",\"title\":\"...\"}]}. One entry per slot per date. No other text.",
    messages: [
      {
        role: "user",
        content: [
          `Dates: ${dates.join(", ")}`,
          `Slots each day: ${session.slots.join(", ")}`,
          session.constraints_text ? `Constraints: ${session.constraints_text}` : "",
          priorDisplay ? `Meals from prior draft attempt:\n${priorDisplay.slice(0, 2500)}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
  });

  const llmText = textFromMessage(msg).trim();
  const entries = extractMealPlanJson(llmText);
  if (!entries?.length) {
    return { ok: false, error: "draft JSON missing" };
  }

  const display = stripMealPlanJsonBlock(priorDisplay) || priorDisplay || "(draft)";
  return { ok: true, display, entries };
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

  const chunks = chunkHorizonDates(session.horizon_start, session.horizon_end);
  if (chunks.length <= 1) {
    const single = await generateDraftOnce(ctx, session, revisionNotes);
    if (single.ok) {
      return single;
    }
    if (single.llmText) {
      const recovered = await generateDraftJsonRecovery(session, single.llmText);
      if (recovered.ok) {
        return recovered;
      }
    }
    return { ok: false, error: single.error };
  }

  const displayParts: string[] = [];
  const allEntries: NonNullable<ReturnType<typeof extractMealPlanJson>> = [];

  for (const dateChunk of chunks) {
    const chunkStart = dateChunk[0]!;
    const chunkEnd = dateChunk[dateChunk.length - 1]!;
    const chunkSession = {
      ...session,
      horizon_start: chunkStart,
      horizon_end: chunkEnd,
    };
    const chunkResult = await generateDraftOnce(ctx, chunkSession, revisionNotes);
    if (!chunkResult.ok) {
      if (chunkResult.llmText) {
        const recovered = await generateDraftJsonRecovery(chunkSession, chunkResult.llmText);
        if (recovered.ok) {
          displayParts.push(recovered.display);
          allEntries.push(...recovered.entries);
          continue;
        }
      }
      return { ok: false, error: chunkResult.error };
    }
    displayParts.push(chunkResult.display);
    allEntries.push(...chunkResult.entries);
  }

  return {
    ok: true,
    display: displayParts.join("\n\n"),
    entries: allEntries,
  };
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
    "Reply **save plan** to lock this menu, **save plan for Mon–Wed** for a partial lock, or tell me what to change.",
    "Say **cancel planning** to discard.",
  ].join("\n");
}

async function lockPlanEntries(
  ctx: AgentContext,
  session: MealPlanSessionRow,
  entries: MealPlanEntryInput[],
  partial: boolean,
): Promise<AgentResult> {
  if (!entries.length) {
    return {
      text: "No meals matched that date range — check the days or say **save plan** for the full draft.",
      metadata: flowMeta(session, { meal_plan_saved: false }),
    };
  }

  const saved = await savePlanEntries(ctx.userProfileId, entries, "chat");
  if (!saved.ok) {
    return {
      text: `Could not lock plan: ${saved.error}`,
      metadata: flowMeta(session, { meal_plan_saved: false, error: saved.error }),
    };
  }

  const foodSync = await syncLockedPlanToFoodList({
    userProfileId: ctx.userProfileId,
    entries,
  });

  const savedDates = new Set(entries.map((e) => e.local_date));
  const remaining = session.draft_entries.filter((e) => !savedDates.has(e.local_date));

  if (partial && remaining.length > 0) {
    await updateMealPlanSession(session.id, {
      status: "draft",
      step: "review",
      draft_entries: remaining,
      revision_notes: null,
    });

    const dateRange =
      saved.dates.length === 1
        ? saved.dates[0]
        : `${saved.dates[0]} → ${saved.dates[saved.dates.length - 1]}`;

    const foodNote =
      foodSync.added.length > 0
        ? `\nAdded to food wishlist: ${foodSync.added.slice(0, 5).join(", ")}.`
        : "";

    return {
      text: [
        `**Partial lock** — ${saved.savedCount} meal(s) saved for ${dateRange}.`,
        `${remaining.length} meal(s) still in draft for other days.`,
        "",
        "Reply **save plan** for the rest, or keep revising.",
        foodNote,
      ]
        .filter(Boolean)
        .join("\n"),
      metadata: flowMeta(session, {
        meal_plan_saved: true,
        meal_plan_partial_lock: true,
        saved_count: saved.savedCount,
        remaining_count: remaining.length,
      }),
    };
  }

  await lockMealPlanSession(session.id);

  const dateRange =
    saved.dates.length === 1
      ? saved.dates[0]
      : `${saved.dates[0]} → ${saved.dates[saved.dates.length - 1]}`;

  const foodNote =
    foodSync.added.length > 0
      ? `\nAdded to food wishlist: ${foodSync.added.slice(0, 5).join(", ")}.`
      : "";

  return {
    text: [
      `**Plan locked** — ${saved.savedCount} meal(s) saved for ${dateRange}.`,
      "",
      "I'll use this for reminders, adherence nudges, and log matching. Say **show my meal plan** anytime.",
      foodNote,
    ]
      .filter(Boolean)
      .join("\n"),
    metadata: flowMeta(session, {
      meal_plan_saved: true,
      meal_plan_locked: true,
      saved_count: saved.savedCount,
      plan_dates: saved.dates,
      food_list_added: foodSync.added.length,
    }),
  };
}

async function handleReviewStep(
  ctx: AgentContext,
  session: MealPlanSessionRow,
  raw: string,
): Promise<AgentResult> {
  if (session.horizon_start && session.horizon_end) {
    const partialDates = parsePartialLockDates(raw, session.horizon_start, session.horizon_end);
    if (partialDates?.length) {
      const dateSet = new Set(partialDates);
      const toLock = session.draft_entries.filter((e) => dateSet.has(e.local_date));
      return lockPlanEntries(ctx, session, toLock, true);
    }
  }

  if (LOCK_RE(raw.trim())) {
    if (!session.draft_entries.length) {
      return {
        text: "No draft to save yet — I'll rebuild one. What should change?",
        metadata: flowMeta(session, { meal_plan_saved: false }),
      };
    }

    return lockPlanEntries(ctx, session, session.draft_entries, false);
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
    await updateMealPlanSession(session.id, {
      status: "gathering",
      step: "constraints",
    });
    const range =
      session.horizon_start && session.horizon_end
        ? `${session.horizon_start} → ${session.horizon_end}`
        : "your dates";
    return {
      text: [
        `I couldn't finish the draft (${draft.error}).`,
        "",
        `Horizon **${range}** and slots are saved.`,
        "Say **skip** to retry the draft, **cancel planning** to start over, or try a shorter range (e.g. one week).",
      ].join("\n"),
      metadata: flowMeta(
        { ...session, status: "gathering", step: "constraints" },
        { meal_plan_saved: false, meal_plan_draft_failed: true },
      ),
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
    return {
      text: [
        `Got it — **${formatSlotsLabel(slots)}** each day.`,
        "",
        `Noted for this stretch: ${constraintsFromMessage}`,
        "",
        "**Anything else before I draft?** Diets, batch prep, travel — or say **skip** to generate the draft.",
      ].join("\n"),
      metadata: flowMeta(
        { ...nextSession, constraints_text: constraintsFromMessage },
        { meal_plan_step: "constraints" },
      ),
    };
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

/** Fast-path: rich first message with clear horizon — gather slots before drafting. */
function tryFastPathConstraints(raw: string, today: string): {
  horizon: ReturnType<typeof parsePlanningHorizon>;
  constraints: string | null;
} | null {
  const horizon = parsePlanningHorizon(raw, today);
  if (!horizon) {
    return null;
  }
  const stripped = raw
    .replace(/\b(?:meal\s+plan(?:ning)?|plan\s+my\s+meals|weekly\s+menu|menu\s+for|help me make the plan)\b/gi, "")
    .replace(/\btomorrow\s+is\s+monday\.?\b/gi, "")
    .replace(/\b(?:today|this\s+week)\b/gi, "")
    .replace(/\s+/g, " ")
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
  const raw = sanitizeMealPlanningUserMessage(ctx.rawMessage);

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

  session = await maybeRefreshHorizonFromMessage(session, raw, ctx.timezone);

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
    const slots =
      parsePlanningSlots(raw) ?? defaultSlotsFromTimingNotes(healthRow?.meal_timing_notes);
    await updateMealPlanSession(session.id, {
      horizon_start: fast.horizon.startDate,
      horizon_end: fast.horizon.endDate,
      slots,
      constraints_text: fast.constraints,
      step: "slots",
    });
    const nextSession = {
      ...session,
      horizon_start: fast.horizon.startDate,
      horizon_end: fast.horizon.endDate,
      slots,
      constraints_text: fast.constraints,
      step: "slots" as const,
    };

    if (parsePlanningSlots(raw)) {
      await updateMealPlanSession(session.id, { step: "constraints" });
      const withConstraintsStep = { ...nextSession, step: "constraints" as const };
      return {
        text: [
          `Planning **${fast.horizon.label}** (${fast.horizon.startDate} → ${fast.horizon.endDate}).`,
          "",
          `Noted for this stretch: ${fast.constraints}`,
          "",
          "**Anything else before I draft?** Diets, batch prep, travel — or say **skip** to generate the draft.",
        ].join("\n"),
        metadata: flowMeta(withConstraintsStep, { meal_plan_step: "constraints" }),
      };
    }

    return {
      text: [
        `Planning **${fast.horizon.label}** (${fast.horizon.startDate} → ${fast.horizon.endDate}).`,
        "",
        `Noted: ${fast.constraints}`,
        "",
        "**Which meals each day?** Default is breakfast, lunch, dinner — say **add snacks**, **dinners only**, or **skip** for default.",
      ].join("\n"),
      metadata: flowMeta(nextSession, { meal_plan_step: "slots" }),
    };
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
