/**
 * Coach chat: the app's home screen. Claude reads the user's message, calls the same actions the
 * tracker uses, and answers in a short coaching voice. Meals come back as an editable draft card;
 * nothing is logged as a meal until the user confirms it.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { logger } from "../logger.js";
import { anthropic, supabase } from "../tools/clients.js";
import { loggableError } from "../util/loggableError.js";
import {
  checkinInput,
  goalInput,
  logCheckin,
  logSteps,
  mealDraftInput,
  removeMeal,
  setGoal,
  setTargets,
  startMealDraft,
  stepsInput,
  targetsInput,
  type ActionContext,
} from "./actions.js";
import type { MealDraft } from "./meals.js";
import { activityDraftInput, buildActivityDraft, deleteActivity, type ActivityDraft } from "./activityLog.js";
import { routineInput } from "./routine.js";
import { answerRoutineCheck, routineCheckAnswerInput, setRoutine, type RoutineCheckCard } from "./routineCheck.js";
import { cardHistoryNote, emptyCardStates, loadCardStates, type CardStates } from "./chatCards.js";
import { buildTurnContext, legacyTurnContext, systemPrompt, usingLegacyPrompt } from "./chatPrompt.js";
import { buildHealthSnapshot, type HealthSnapshot } from "./snapshot.js";
import {
  newRoutineInput,
  proposeNewRoutine,
  proposeRoutineChange,
  proposeWorkoutLog,
  routineChangeInput,
  workoutLogInput,
  type HevyProposalCard,
} from "./hevyProposals.js";
import {
  analyzeTraining,
  exerciseCatalog,
  hevyKey,
  loadRoutines,
  loadWorkoutHistory,
  routineForModel,
  searchTemplates,
} from "./training.js";
import { cardFromReport, runRca, type RcaCard } from "./rca.js";
import { loadCalorieReview, type CalorieReview } from "./calorieTarget.js";
import { loadPersonalDetails } from "./onboarding.js";
import { enqueueEvents } from "./events.js";
import { randomUUID } from "node:crypto";
import { answerWorkoutCheck, workoutCheckAnswerInput, type WorkoutCheckCard } from "./workoutCheck.js";

export function healthChatModel(): string {
  // Sonnet answers a tool-heavy coach turn several times faster than Opus; set the env var to
  // trade speed back for depth.
  return process.env.MAGNUS_HEALTH_CHAT_MODEL?.trim() || "claude-sonnet-5-5";
}

/** The cheap model for routine logging turns (about 20x cheaper per token than Sonnet). */
export function healthChatFastModel(): string {
  return process.env.MAGNUS_HEALTH_CHAT_FAST_MODEL?.trim() || "claude-haiku-5-5";
}

/**
 * Words that mean the person wants thinking, not just a log: these turns stay on the main model.
 * Questions and coaching asks; and reasons, states and slips ("skipped gym, knee hurts", "binged
 * last night", "feeling low", "was travelling"), which need an answer, not only a record. "same as
 * yesterday" needs history reasoning too.
 */
const COACHING = new RegExp(
  [
    "\\?",
    // Prefixes: "stalled", "travelling", "skipped", "struggling" all match.
    "\\b(?:why|should|could|would|plan|advice|advise|help|how (?:am|do|did|can|much|many|should)|what (?:should|can|do|did|is|are)|routine|program|stall|plateau|progress|review|analy[sz]|explain|recommend|suggest|change|swap|replace|week|goal|target|deadline|maintenance|on track|off track|slip|struggl|craving|tired|sore|injur|pain|sick|sleep|stress|motivat|skip|miss|binge|feel|anxi|depress|starv|travel|cramp)",
    // Whole words only: "low" must not catch "lower", "ill" must not catch "will".
    "\\b(?:low|sad|ill|flu|busy|lazy|cheat|drank|mood|fever|hungry|hangover|hungover|junk|rest day|same as|didn'?t|couldn'?t|unwell|headache)\\b",
  ].join("|"),
  "i",
);

/**
 * Tools whose call means the turn turned into coaching (analysis, a Hevy change, a plan). If the
 * fast model reached for one, the rest of the turn runs on the main model, which writes the
 * explanation.
 */
const COACHING_TOOLS = new Set([
  "get_training_analysis",
  "get_routines",
  "search_exercises",
  "propose_routine_change",
  "propose_new_routine",
  "propose_workout_log",
  "root_cause_analysis",
  "review_calorie_target",
  "set_daily_routine",
  "set_goal",
]);

/** A message with a number, a food, a weigh-in or an activity in it almost always wants a log. */
const LOGGABLE = /\d|\b(ate|had|eat|eating|khaya|khayi|khaaya|piya|drank|walk(ed)?|ran|run|swam|swim|cycled|gym|lifted|kg|kgs|steps|roti|rice|dal|chai|coffee|breakfast|lunch|dinner|snack|weigh(ed)?|weight)\b/i;

/** True when the fast model answered a loggable message with words only: it should have called a tool. */
export function fastModelDodgedLog(userText: string, toolCalls: number, round: number): boolean {
  return round === 0 && toolCalls === 0 && LOGGABLE.test(userText);
}

/**
 * Which model answers this turn. Short, plain logs ("2 roti and dal for lunch", "walked 6k steps",
 * "82.4 this morning") go to the fast model; anything that asks a question or wants coaching goes
 * to the main one. `MAGNUS_HEALTH_CHAT_ROUTING=off` sends everything to the main model.
 */
export function pickChatModel(text: string, env: NodeJS.ProcessEnv = process.env): string {
  const main = env.MAGNUS_HEALTH_CHAT_MODEL?.trim() || "claude-sonnet-5-5";
  if (env.MAGNUS_HEALTH_CHAT_ROUTING?.trim().toLowerCase() === "off") return main;
  const t = text.trim();
  if (t.length > 160 || COACHING.test(t)) return main;
  return env.MAGNUS_HEALTH_CHAT_FAST_MODEL?.trim() || "claude-haiku-5-5";
}

const HISTORY_MESSAGES = 20;

/**
 * Budgets for one turn. The app stops waiting at 90 s, so the server must be done well before
 * that: a hard wall clock for the whole turn, a timeout per model call and per tool, a cap on
 * rounds, and an output cap (a coach reply is 1 to 4 sentences; tool inputs are the only thing
 * that ever needs room). When a budget runs out the coach says what it managed, never "Done.".
 */
export const TURN_BUDGET = {
  wallMs: envInt("MAGNUS_CHAT_WALL_MS", 70_000),
  callTimeoutMs: envInt("MAGNUS_CHAT_CALL_TIMEOUT_MS", 40_000),
  toolTimeoutMs: envInt("MAGNUS_CHAT_TOOL_TIMEOUT_MS", 45_000),
  maxRounds: envInt("MAGNUS_CHAT_MAX_ROUNDS", 6),
  maxTokens: envInt("MAGNUS_CHAT_MAX_TOKENS", 4096),
  /** Below this much time left, don't start another model call. */
  minCallMs: 3_000,
};

function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name]?.trim() || "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export type CalorieReviewCard = { type: "calorie_review"; review: Extract<CalorieReview, { status: "ok" }> };

export type ActivityDraftCard = { type: "activity_draft"; draft: ActivityDraft; saved?: { durationMin: number; kcal: number } };

export type MealDraftCard = { type: "meal_draft"; draft: MealDraft; saved?: { calories: number } };

export type ChatCard =
  | MealDraftCard
  | ActivityDraftCard
  | WorkoutCheckCard
  | RoutineCheckCard
  | HevyProposalCard
  | RcaCard
  | CalorieReviewCard;

export type ChatReply = {
  text: string;
  cards: ChatCard[];
  /** True when the turn wrote data, so the tracker should refresh. */
  changed: boolean;
  /** The turn this reply answers; the client sends it so a retry can't log twice. */
  turnId?: string;
  /** True when this is the stored reply to a turn the client sent before (a retry after a timeout). */
  replayed?: boolean;
};

export type ChatMessageStatus = "ok" | "pending" | "failed";

export type ChatHistoryRow = {
  role: "user" | "assistant";
  content: string;
  cards: ChatCard[];
  createdAt: string;
  turnId: string | null;
  status: ChatMessageStatus;
};

/** A turn still being answered when a retry with the same id arrives; after this it's assumed dead. */
const IN_PROGRESS_MS = 150_000;

const SET_SCHEMA = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["warmup", "normal", "failure", "dropset"] },
    weightKg: { type: "number" },
    reps: { type: "integer" },
    repRange: {
      type: "object",
      properties: { start: { type: "integer" }, end: { type: "integer" } },
      required: ["start", "end"],
    },
    durationSeconds: { type: "integer" },
  },
};

const EXERCISE_SCHEMA = {
  type: "object",
  properties: {
    exerciseTemplateId: { type: "string" },
    sets: { type: "array", items: SET_SCHEMA },
    restSeconds: { type: "integer" },
    notes: { type: "string" },
  },
  required: ["exerciseTemplateId", "sets"],
};

const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "get_status",
    description:
      "Today's checks, the 7-day north star, goal progress with pace, today's meals and recent Hevy workouts.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "draft_meal",
    description:
      "Estimate a meal from a plain description and show it to the person as an editable card to confirm. Does not log it.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "What they ate, with portions if given." },
        slot: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] },
      },
      required: ["text"],
    },
  },
  {
    name: "draft_activity",
    description:
      "Estimate calories burned for an activity that isn't lifting (swim, run, cycle, sport, yoga...) and show it as a card to save. Does not save it. Says whether it counts as the day's training.",
    input_schema: {
      type: "object",
      properties: {
        activity: { type: "string", description: "What they did, e.g. 'swimming', 'football', 'badminton doubles'." },
        durationMin: { type: "integer" },
        intensity: { type: "string", enum: ["easy", "moderate", "hard"], description: "From how they describe it; default moderate." },
        distanceKm: { type: "number" },
        kcal: { type: "integer", description: "Only if they quote a number from a watch or machine." },
        date: { type: "string", description: "YYYY-MM-DD, default today" },
        startTime: { type: "string", description: "Local HH:MM when they started, if they said." },
      },
      required: ["activity", "durationMin"],
    },
  },
  {
    name: "delete_activity",
    description: "Remove a logged activity by its id (from get_status recentActivities).",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "delete_meal",
    description: "Remove a logged meal by its mealSessionId (from get_status).",
    input_schema: {
      type: "object",
      properties: { mealSessionId: { type: "string" } },
      required: ["mealSessionId"],
    },
  },
  {
    name: "log_steps",
    description:
      "Save the step total for a day (the day's total, not an increment), optionally walk minutes.",
    input_schema: {
      type: "object",
      properties: {
        steps: { type: "integer" },
        walkMinutes: { type: "integer" },
        date: { type: "string", description: "YYYY-MM-DD, default today" },
      },
      required: ["steps"],
    },
  },
  {
    name: "log_body_checkin",
    description: "Save a weigh-in: weight, body fat %, and/or muscle mass for a day.",
    input_schema: {
      type: "object",
      properties: {
        weightKg: { type: "number" },
        bodyFatPct: { type: "number" },
        muscleMassKg: { type: "number" },
        date: { type: "string", description: "YYYY-MM-DD, default today" },
        note: { type: "string" },
      },
    },
  },
  {
    name: "set_goal",
    description:
      "Set the outcome goal (replaces the current one): any of target weight, body fat %, muscle mass, plus a deadline.",
    input_schema: {
      type: "object",
      properties: {
        targetWeightKg: { type: "number" },
        targetBodyFatPct: { type: "number" },
        targetMuscleMassKg: { type: "number" },
        deadline: { type: "string", description: "YYYY-MM-DD" },
        notes: { type: "string" },
      },
      required: ["deadline"],
    },
  },
  {
    name: "set_daily_targets",
    description:
      "Update daily targets: calories (upper limit), protein grams (minimum), steps. trainingDays and gymTime only matter when there's no routine; with a routine, change the routine with set_daily_routine instead.",
    input_schema: {
      type: "object",
      properties: {
        calorieTarget: { type: "integer" },
        proteinTarget: { type: "integer" },
        stepTarget: { type: "integer" },
        trainingDays: { type: "array", items: { type: "integer" } },
        gymTime: {
          type: ["string", "null"],
          description: "Gym slot start on training days, local 24h HH:MM. null clears it.",
        },
        checkDelayMin: {
          type: "integer",
          description: "Minutes after the gym slot to check Hevy for a workout (default 180).",
        },
      },
    },
  },
  {
    name: "get_training_analysis",
    description:
      "Analyse Hevy history: workouts per week, weekly volume, and per exercise the estimated-1RM trend (progressing / stalled / regressing / new), last top set and working sets per week.",
    input_schema: {
      type: "object",
      properties: { weeks: { type: "integer", description: "Window, 2–16 weeks. Default 8." } },
    },
  },
  {
    name: "get_routines",
    description: "The person's Hevy routines with each exercise's exerciseTemplateId, sets scheme, rest and notes.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "search_exercises",
    description: "Find Hevy exercise templates by name, e.g. 'incline dumbbell press'. Returns ids to use in propose_* tools.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "propose_routine_change",
    description:
      "Propose edits to one existing Hevy routine as operations: replace (swap an exercise), add, remove, update (sets/rest/notes). Exercises not mentioned stay as they are. Shows a card; nothing changes in Hevy until the person applies it.",
    input_schema: {
      type: "object",
      properties: {
        routineId: { type: "string" },
        reason: { type: "string", description: "One sentence on why, from their data." },
        title: { type: "string", description: "Only to rename the routine." },
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              op: { type: "string", enum: ["replace", "add", "remove", "update"] },
              exerciseTemplateId: { type: "string", description: "The exercise in the routine (replace/remove/update)." },
              newExerciseTemplateId: { type: "string", description: "replace: the new exercise." },
              exercise: { ...EXERCISE_SCHEMA, description: "add: the exercise to add." },
              afterExerciseTemplateId: { type: "string", description: "add: insert after this exercise; default at the end." },
              sets: { type: "array", items: SET_SCHEMA },
              restSeconds: { type: "integer" },
              notes: { type: "string" },
            },
            required: ["op"],
          },
        },
      },
      required: ["routineId", "reason", "changes"],
    },
  },
  {
    name: "propose_new_routine",
    description: "Propose a new Hevy routine. Shows a card; it's created only when the person applies it.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        reason: { type: "string" },
        notes: { type: "string" },
        exercises: { type: "array", items: EXERCISE_SCHEMA },
      },
      required: ["title", "exercises"],
    },
  },
  {
    name: "propose_workout_log",
    description:
      "Propose logging a completed workout to Hevy from what they describe (exercises, weights, reps). Shows a card; it's logged only when the person applies it.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "e.g. the routine name, 'Push', 'Legs'." },
        startTime: { type: "string", description: "ISO 8601 with offset, in their timezone." },
        durationMin: { type: "integer" },
        description: { type: "string" },
        exercises: {
          type: "array",
          items: {
            type: "object",
            properties: {
              exerciseTemplateId: { type: "string" },
              sets: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string", enum: ["warmup", "normal", "failure", "dropset"] },
                    weightKg: { type: "number" },
                    reps: { type: "integer" },
                    durationSeconds: { type: "integer" },
                    distanceMeters: { type: "integer" },
                    rpe: { type: "number" },
                  },
                },
              },
              notes: { type: "string" },
            },
            required: ["exerciseTemplateId", "sets"],
          },
        },
      },
      required: ["title", "startTime", "durationMin", "exercises"],
    },
  },
  {
    name: "root_cause_analysis",
    description:
      "Find why they're off track: mines the last 3 weeks (which checks fail, which days, missing meals, late eating, step patterns, skip reasons), then writes one hypothesis and one 7-day experiment. Shows a card they can accept.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "review_calorie_target",
    description:
      "Work out maintenance calories from the last 4 weeks of logged meals and weigh-ins, and the daily calorie target that keeps them on pace for their weight goal (capped at a safe pace). Shows a card with an Apply button when the target should change.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "set_daily_routine",
    description:
      "Replace the person's weekly routine. Each item: activity ('gym' for lifting in Hevy, or walking, running, swimming, cycling, football, badminton, cricket, yoga...), days (0 = Sunday … 6 = Saturday), startTime local HH:MM (or null for no fixed time), durationMin, remindBeforeMin (minutes before to remind; null for no reminder; default 15, gym 30), optional label ('Morning walk'). Pass existing items' ids to keep them. Training days are derived from it (everything except walks).",
    input_schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              activity: { type: "string" },
              label: { type: "string" },
              days: { type: "array", items: { type: "integer" } },
              startTime: { type: ["string", "null"] },
              durationMin: { type: "integer" },
              remindBeforeMin: { type: ["integer", "null"] },
            },
            required: ["activity", "days", "durationMin"],
          },
        },
      },
      required: ["items"],
    },
  },
  {
    name: "answer_routine_check",
    description:
      "Record the answer for a non-gym routine item on a day: done (logs the activity at its planned time; pass durationMin if they did a different length), skipped (with their reason), or recheck (look at the logs again).",
    input_schema: {
      type: "object",
      properties: {
        itemId: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD; defaults to today." },
        answer: { type: "string", enum: ["done", "skipped", "recheck"] },
        durationMin: { type: "integer" },
        reason: { type: "string" },
      },
      required: ["itemId", "answer"],
    },
  },
  {
    name: "answer_workout_check",
    description:
      "Record the answer to the post-gym-slot workout check: recheck (look in Hevy again), skipped (with reason), or trained_unlogged (trained but didn't log in Hevy; counts as the day's workout).",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD; defaults to today." },
        answer: { type: "string", enum: ["recheck", "skipped", "trained_unlogged"] },
        reason: { type: "string", description: "Why they skipped, in their words." },
      },
      required: ["answer"],
    },
  },
];

/**
 * The tool schema is about 12 KB and goes with every call; a cache marker on the last tool caches
 * the whole prefix (system prompt + tools) so later rounds and turns pay a fraction for it.
 */
const tools: Anthropic.Tool[] = toolDefinitions.map((t, i) =>
  i === toolDefinitions.length - 1 ? { ...t, cache_control: { type: "ephemeral" as const } } : t,
);

/** Compact status for the model: enough to coach from, without raw arrays it doesn't need. */
export function statusForModel(s: HealthSnapshot): Record<string, unknown> {
  return {
    today: s.today.date,
    timezone: s.timezone,
    northStar: {
      onTrackDays: s.northStar.onTrackDays,
      of: s.northStar.windowDays,
      goal: s.northStar.goal,
      mostMissed: s.northStar.mostMissed,
      days: s.northStar.days.map((d) => ({
        date: d.date,
        onTrack: d.onTrack,
        missed: d.checks.filter((c) => !c.met).map((c) => c.id),
      })),
    },
    todayChecks: s.today.checks.map((c) => ({ check: c.id, met: c.met, detail: c.detail })),
    targets: s.targets,
    goal: s.goal,
    lastCheckins: s.checkins.slice(-6),
    mealsToday: s.meals,
    recentWorkouts: s.workouts.slice(0, 5),
    hevyConnected: s.hevyConnected,
    gymSlot: s.gym,
    routine: (s.routine ?? []).map((i) => ({
      id: i.id,
      activity: i.activityKey,
      label: i.label,
      days: i.days,
      startTime: i.startTime,
      durationMin: i.durationMin,
      remindBeforeMin: i.remindBeforeMin,
    })),
    routineToday: (s.today.routine ?? []).map((r) => ({ itemId: r.itemId, label: r.label, state: r.state, detail: r.detail })),
    workoutChecks: s.workoutChecks,
    recentActivities: (s.activities ?? []).map((a) => ({
      id: a.id,
      date: a.localDate,
      label: a.label,
      durationMin: a.durationMin,
      kcal: a.kcal,
      from: a.source === "health_connect" ? "Health Connect" : "logged",
      countedTwice: Boolean(a.duplicateOf),
    })),
  };
}

export type ToolOutcome = { result: unknown; card?: ChatCard; changed?: boolean };

function invalid(err: z.ZodError): ToolOutcome {
  return { result: { ok: false, error: "invalid_input", issues: err.issues.map((i) => i.message) } };
}

async function withParsed<S extends z.ZodTypeAny, R>(
  schema: S,
  input: unknown,
  fn: (data: z.infer<S>) => Promise<R>,
): Promise<R | { ok: false; error: "invalid_input"; issues: string[] }> {
  const p = schema.safeParse(input);
  if (!p.success) {
    return { ok: false, error: "invalid_input", issues: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  return fn(p.data);
}

export async function runTool(
  ctx: ActionContext,
  name: string,
  input: unknown,
): Promise<ToolOutcome> {
  switch (name) {
    case "get_status":
      return { result: statusForModel(await buildHealthSnapshot(ctx.userProfileId, ctx.now)) };
    case "draft_meal": {
      const p = mealDraftInput.safeParse(input);
      if (!p.success) return invalid(p.error);
      const draft = await startMealDraft(ctx, p.data);
      return {
        result: {
          shownToUserAsCard: true,
          estimated: draft.estimated,
          totals: draft.totals,
          items: draft.items,
          slot: draft.slot,
          source: draft.source,
        },
        card: { type: "meal_draft", draft },
      };
    }
    case "draft_activity": {
      const p = activityDraftInput.safeParse({ ...(input as object), source: "chat" });
      if (!p.success) return invalid(p.error);
      const draft = await buildActivityDraft(ctx, p.data);
      if ("ok" in draft) return { result: draft };
      return {
        result: {
          shownToUserAsCard: true,
          label: draft.label,
          kcal: draft.kcal,
          alreadyFromHealthConnect: draft.duplicateOf,
          countsAsTraining: draft.training.countsAsTraining,
          trainingNote: draft.training.note,
        },
        card: { type: "activity_draft", draft },
      };
    }
    case "delete_activity": {
      const id = (input as { id?: unknown })?.id;
      const r = await deleteActivity(ctx, typeof id === "string" ? id : "");
      return { result: r, changed: r.ok };
    }
    case "delete_meal": {
      const id = (input as { mealSessionId?: unknown })?.mealSessionId;
      const r = await removeMeal(ctx, typeof id === "string" ? id : "");
      return { result: r, changed: r.ok };
    }
    case "log_steps": {
      const p = stepsInput.safeParse({ ...(input as object), source: "manual" });
      if (!p.success) return invalid(p.error);
      const r = await logSteps(ctx, p.data);
      return { result: r, changed: r.ok };
    }
    case "log_body_checkin": {
      const p = checkinInput.safeParse(input);
      if (!p.success) return invalid(p.error);
      const r = await logCheckin(ctx, p.data);
      return { result: r, changed: r.ok };
    }
    case "set_goal": {
      const p = goalInput.safeParse(input);
      if (!p.success) return invalid(p.error);
      const r = await setGoal(ctx, p.data);
      return { result: r, changed: r.ok };
    }
    case "set_daily_targets": {
      const p = targetsInput.safeParse(input);
      if (!p.success) return invalid(p.error);
      const r = await setTargets(ctx, p.data);
      return { result: r, changed: r.ok };
    }
    case "get_training_analysis": {
      const weeks = Math.min(16, Math.max(2, Number((input as { weeks?: unknown })?.weeks) || 8));
      const apiKey = await hevyKey(ctx.userProfileId);
      if (!apiKey) return { result: { ok: false, error: "hevy_not_connected" } };
      const now = ctx.now ?? new Date();
      const h = await loadWorkoutHistory(apiKey, now, weeks);
      if (!h.ok) return { result: { ok: false, error: "hevy_unavailable" } };
      const a = analyzeTraining(h.workouts, now, ctx.timezone, weeks);
      // The full e1RM series is for charts; the model only needs the summary.
      return { result: { ...a, exercises: a.exercises.map(({ e1rmSeries, ...e }) => ({ ...e, latestE1rm: e1rmSeries.at(-1)?.e1rm ?? null })) } };
    }
    case "get_routines": {
      const apiKey = await hevyKey(ctx.userProfileId);
      if (!apiKey) return { result: { ok: false, error: "hevy_not_connected" } };
      const r = await loadRoutines(apiKey);
      return { result: r.ok ? { routines: r.routines.map(routineForModel) } : { ok: false, error: "hevy_unavailable" } };
    }
    case "search_exercises": {
      const query = String((input as { query?: unknown })?.query ?? "").slice(0, 100);
      const apiKey = await hevyKey(ctx.userProfileId);
      if (!apiKey) return { result: { ok: false, error: "hevy_not_connected" } };
      const cat = await exerciseCatalog(apiKey);
      if (!cat.ok) return { result: { ok: false, error: "hevy_unavailable" } };
      return { result: { matches: searchTemplates(query, cat.templates) } };
    }
    case "propose_routine_change":
    case "propose_new_routine":
    case "propose_workout_log": {
      const r =
        name === "propose_routine_change"
          ? await withParsed(routineChangeInput, input, (d) => proposeRoutineChange(ctx, d))
          : name === "propose_new_routine"
            ? await withParsed(newRoutineInput, input, (d) => proposeNewRoutine(ctx, d))
            : await withParsed(workoutLogInput, input, (d) => proposeWorkoutLog(ctx, d));
      if ("issues" in r) return { result: r };
      if (!r.ok) return { result: r };
      return {
        result: { shownToUserAsCard: true, proposalId: r.card.proposalId, summary: r.card.lines.map((l) => l.text) },
        card: r.card,
      };
    }
    case "root_cause_analysis": {
      const r = await runRca(ctx.userProfileId, "manual", ctx.now);
      if (!r) return { result: { ok: false, error: "not_enough_data", hint: "Fewer than 3 days with anything logged in the last 3 weeks." } };
      return {
        result: { shownToUserAsCard: true, evidence: r.report.signals.map((x) => x.text), hypothesis: r.report.hypothesis, experiment: r.report.experiment },
        card: cardFromReport(r.report),
      };
    }
    case "review_calorie_target": {
      const review = await loadCalorieReview(ctx.userProfileId, ctx.now);
      if (review.status !== "ok" || !review.recommend) return { result: review };
      return { result: { ...review, shownToUserAsCard: true }, card: { type: "calorie_review", review } };
    }
    case "set_daily_routine": {
      const p = routineInput.safeParse(input);
      if (!p.success) return invalid(p.error);
      const r = await setRoutine(ctx, p.data);
      return {
        result: r.ok ? { ok: true, items: r.items.map((i) => ({ id: i.id, label: i.label, days: i.days, startTime: i.startTime })), trainingDays: r.trainingDays, lifting: r.lifting } : r,
        changed: r.ok,
      };
    }
    case "answer_routine_check": {
      const p = routineCheckAnswerInput.safeParse(input);
      if (!p.success) return invalid(p.error);
      const r = await answerRoutineCheck(ctx, p.data);
      return { result: r, changed: r.ok };
    }
    case "answer_workout_check": {
      const p = workoutCheckAnswerInput.safeParse(input);
      if (!p.success) return invalid(p.error);
      const r = await answerWorkoutCheck(ctx, p.data);
      return { result: r, changed: r.ok };
    }
    default:
      return { result: { ok: false, error: `unknown tool ${name}` } };
  }
}

/** The coach's line under an activity card. */
export function activityDraftReply(d: ActivityDraft): string {
  if (d.duplicateOf) {
    return `Health Connect already has ${d.duplicateOf.label.toLowerCase()} for that day (${d.duplicateOf.durationMin} min, about ${d.duplicateOf.kcal} kcal), so I won't count it twice. If it was a separate session, save it from the card.`;
  }
  const what = `${d.durationMin} min of ${d.label.toLowerCase()}`;
  const parts = [`That's about ${d.kcal} kcal for ${what}${d.kcalSource === "user" ? ", as your watch said" : ""}. Check the card and tap Save.`];
  if (d.training.note) parts.push(d.training.note);
  return parts.join(" ");
}

/** The coach's line under meal draft cards. */
export function mealDraftReply(drafts: MealDraft[]): string {
  const missing = drafts.filter((d) => !d.estimated);
  const found = drafts.filter((d) => d.estimated);
  const parts: string[] = [];
  if (found.length) {
    const kcal = found.reduce((s, d) => s + d.totals.calories, 0);
    const protein = Math.round(found.reduce((s, d) => s + d.totals.protein_g, 0));
    const slot = found.length === 1 && found[0]!.slot !== "unspecified" ? ` for ${found[0]!.slot}` : "";
    parts.push(`That comes to about ${kcal} kcal and ${protein} g protein${slot}. Check the card, fix anything that's off, then tap Confirm & log.`);
  }
  if (missing.length) {
    parts.push(
      found.length
        ? "I couldn't find numbers for one of them, so fill in its calories and protein on the card."
        : "I couldn't find reliable numbers for that. Enter the calories and protein on the card, then tap Confirm & log.",
    );
  }
  return parts.join(" ");
}

export type CreateOptions = {
  signal?: AbortSignal;
  timeout?: number;
  maxRetries?: number;
  /** When given, the call streams and each text delta is passed here as it arrives. */
  onText?: (delta: string) => void;
};
type CreateFn = (params: Record<string, unknown>, options?: CreateOptions) => Promise<Anthropic.Message>;

function defaultCreate(): CreateFn {
  return ({ ...params }, options = {}) => {
    const { onText, ...request } = options;
    const fast = String(params.model).startsWith("claude-haiku");
    // Server-side fallback re-runs a refused request on another model inside the same call;
    // Haiku has none, so a refusal there is handled by the caller.
    const body = fast ? params : { ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };
    if (!onText) {
      return (fast ? anthropic.messages.create(body as never, request) : anthropic.beta.messages.create(body as never, request)) as unknown as Promise<Anthropic.Message>;
    }
    const stream = fast ? anthropic.messages.stream(body as never, request) : anthropic.beta.messages.stream(body as never, request);
    stream.on("text", onText);
    return stream.finalMessage() as unknown as Promise<Anthropic.Message>;
  };
}

/** What a streaming client hears while the turn runs. */
export type ChatStreamEvent =
  | { type: "progress"; text: string }
  | { type: "delta"; text: string }
  | { type: "done"; reply: ChatReply }
  | { type: "error"; error: string; message: string };

const TOOL_PROGRESS: Record<string, string> = {
  get_status: "Checking your week",
  draft_meal: "Working out the meal",
  draft_activity: "Estimating the burn",
  log_steps: "Saving your steps",
  log_body_checkin: "Saving your weigh-in",
  set_goal: "Setting your goal",
  set_daily_targets: "Updating your targets",
  set_daily_routine: "Updating your routine",
  answer_routine_check: "Noting that",
  answer_workout_check: "Noting that",
  get_training_analysis: "Reading your Hevy history",
  get_routines: "Reading your Hevy routines",
  search_exercises: "Finding the exercise",
  propose_routine_change: "Drafting the change",
  propose_new_routine: "Drafting the routine",
  propose_workout_log: "Drafting the workout",
  root_cause_analysis: "Looking at the last three weeks",
  review_calorie_target: "Reviewing your calories",
  delete_meal: "Removing that",
  delete_activity: "Removing that",
};

/** One line for the typing indicator while tools run. */
export function progressLine(toolNames: string[]): string {
  const labels = [...new Set(toolNames.map((n) => TOOL_PROGRESS[n] ?? "Working on it"))];
  return `${labels.slice(0, 2).join(" and ")}…`;
}

export class TurnBudgetExceeded extends Error {
  constructor(public readonly where: "model" | "tool") {
    super(`turn budget exceeded (${where})`);
  }
}

/** Runs a promise against what's left of the turn; a loser throws TurnBudgetExceeded. */
async function withinBudget<T>(p: Promise<T>, remainingMs: number, where: "model" | "tool"): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TurnBudgetExceeded(where)), Math.max(0, remainingMs));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** What a failed tool tells the model, so the coach can tell the person in one plain sentence. */
export function toolFailureResult(name: string, err: unknown): Record<string, unknown> {
  const timedOut = err instanceof TurnBudgetExceeded;
  const raw = err instanceof Error ? err.message : String(err);
  const reason = timedOut
    ? "took too long"
    : /hevy/i.test(raw) || /hevy/i.test(name)
      ? "couldn't reach Hevy"
      : /fetch failed|ECONN|ENOTFOUND|network|timeout|timed out/i.test(raw)
        ? "a network call failed"
        : "an internal error";
  return {
    ok: false,
    error: "tool_failed",
    tool: name,
    reason,
    detail: raw.slice(0, 200),
    tellThePerson: `Say in one plain sentence that this part couldn't be done because it ${reason}, and that they can try again in a minute. Do not claim it was done.`,
  };
}

/** The coach's line when the turn ran out of time: what got done, and what to do next. */
export function budgetReply(stats: Pick<TurnStats, "cards" | "changed" | "tools">): string {
  const did = stats.tools.filter((t) => t.ok).map((t) => t.name);
  const done = stats.changed || stats.cards.length > 0;
  if (done) {
    const what = stats.cards.length ? "the card above" : did.includes("log_steps") ? "your steps" : did.includes("log_body_checkin") ? "your weigh-in" : "part of it";
    return `I got ${what} done but ran out of time before finishing the rest. Ask me again for what's left.`;
  }
  return "That took too long and I couldn't finish it. Try again in a moment, or ask it in a smaller piece.";
}

export async function loadChatHistory(userProfileId: string, limit = HISTORY_MESSAGES): Promise<ChatHistoryRow[]> {
  const { data, error } = await supabase
    .from("health_chat_messages")
    .select("role, content, cards, created_at, turn_id, status")
    .eq("user_profile_id", userProfileId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) {
    return [];
  }
  return data
    .reverse()
    .map((r) => ({
      role: r.role as "user" | "assistant",
      content: String(r.content),
      cards: Array.isArray(r.cards) ? (r.cards as ChatCard[]) : [],
      createdAt: String(r.created_at),
      turnId: r.turn_id ? String(r.turn_id) : null,
      status: (r.status === "pending" || r.status === "failed" ? r.status : "ok") as ChatMessageStatus,
    }));
}

/**
 * What the model should see of history: only turns that completed. A message whose reply failed
 * (or is still running elsewhere) would otherwise look like an unanswered question.
 */
export function completedTurns<T extends { role: "user" | "assistant"; status?: ChatMessageStatus }>(rows: T[]): T[] {
  return rows.filter((r) => r.role === "assistant" || !r.status || r.status === "ok");
}

async function saveChatMessage(
  userProfileId: string,
  role: "user" | "assistant",
  content: string,
  cards: ChatCard[] = [],
  turn: { turnId: string; status: ChatMessageStatus } | null = null,
): Promise<void> {
  const { error } = await supabase.from("health_chat_messages").insert({
    user_profile_id: userProfileId,
    role,
    content,
    cards,
    ...(turn ? { turn_id: turn.turnId, status: turn.status } : {}),
  });
  if (error) {
    logger.warn({ error: error.message }, "health chat message save failed");
  }
}

async function setTurnStatus(userProfileId: string, turnId: string, status: ChatMessageStatus, content?: string): Promise<void> {
  const { error } = await supabase
    .from("health_chat_messages")
    .update({ status, ...(content !== undefined ? { content, created_at: new Date().toISOString() } : {}) })
    .eq("user_profile_id", userProfileId)
    .eq("turn_id", turnId)
    .eq("role", "user");
  if (error) {
    logger.warn({ error: error.message, turnId, status }, "health chat turn status update failed");
  }
}

type TurnStart = { kind: "new" | "retry" } | { kind: "in_progress" } | { kind: "replay"; reply: ChatReply };

/**
 * Claims a turn id. A fresh id gets a pending user row. A repeated id (the client retried after a
 * timeout or a double tap) replays the stored reply, reports that the first attempt is still
 * running, or reopens a failed turn, so nothing is ever logged twice.
 */
async function beginTurn(userProfileId: string, turnId: string, userText: string, now: number): Promise<TurnStart> {
  const { data: existing, error } = await supabase
    .from("health_chat_messages")
    .select("status, created_at")
    .eq("user_profile_id", userProfileId)
    .eq("turn_id", turnId)
    .eq("role", "user")
    .maybeSingle();
  if (error) logger.warn({ error: error.message, turnId }, "health chat turn lookup failed");

  if (!existing) {
    await saveChatMessage(userProfileId, "user", userText, [], { turnId, status: "pending" });
    return { kind: "new" };
  }
  if (existing.status === "ok") {
    const { data: reply } = await supabase
      .from("health_chat_messages")
      .select("content, cards")
      .eq("user_profile_id", userProfileId)
      .eq("turn_id", turnId)
      .eq("role", "assistant")
      .maybeSingle();
    if (reply) {
      return {
        kind: "replay",
        reply: {
          text: String(reply.content),
          cards: Array.isArray(reply.cards) ? (reply.cards as ChatCard[]) : [],
          changed: false,
          turnId,
          replayed: true,
        },
      };
    }
  }
  if (existing.status === "pending" && now - new Date(String(existing.created_at)).getTime() < IN_PROGRESS_MS) {
    return { kind: "in_progress" };
  }
  await setTurnStatus(userProfileId, turnId, "pending", userText);
  return { kind: "retry" };
}

type TurnStats = {
  turnId: string;
  sessionId?: string;
  models: string[];
  rounds: number;
  tools: Array<{ name: string; ms: number; ok: boolean }>;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
  guardFired: boolean;
  cards: string[];
  changed: boolean;
  /** Which budget ended the turn early, if any. */
  budgetHit?: "wall" | "rounds" | "tokens";
  /** Why the turn moved from the fast model to the main one, if it did. */
  escalated?: "no_tool" | "coaching_tool" | "refusal";
};

function addUsage(stats: TurnStats, usage: Anthropic.Usage | undefined): void {
  if (!usage) return;
  const u = usage as Anthropic.Usage & { cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
  stats.usage.input += u.input_tokens ?? 0;
  stats.usage.output += u.output_tokens ?? 0;
  stats.usage.cacheRead += u.cache_read_input_tokens ?? 0;
  stats.usage.cacheWrite += u.cache_creation_input_tokens ?? 0;
}

/** One row per coach turn in health_app_events, plus a log line: what it cost and how it went. */
function logTurn(userProfileId: string, stats: TurnStats, outcome: "ok" | "refusal" | "error" | "replay" | "in_progress" | "budget", wallMs: number, error?: string): void {
  const props = {
    turnId: stats.turnId,
    outcome,
    models: stats.models,
    rounds: stats.rounds,
    tools: stats.tools,
    tokens: stats.usage,
    cards: stats.cards,
    changed: stats.changed,
    guardFired: stats.guardFired,
    ...(stats.budgetHit ? { budgetHit: stats.budgetHit } : {}),
    ...(stats.escalated ? { escalated: stats.escalated } : {}),
    ...(error ? { error: error.slice(0, 300) } : {}),
  };
  logger.info({ userProfileId, wallMs: Math.round(wallMs), ...props }, "health chat turn");
  enqueueEvents([
    {
      user_profile_id: userProfileId,
      session_id: stats.sessionId?.slice(0, 64) ?? null,
      source: "server",
      kind: "chat_turn",
      name: stats.models.at(-1) ?? null,
      duration_ms: Math.round(wallMs),
      status: outcome === "ok" || outcome === "replay" ? 200 : outcome === "in_progress" ? 409 : 500,
      props,
      app_version: null,
      user_agent: null,
      occurred_at: new Date().toISOString(),
    },
  ]);
}

/**
 * Writes a turn that didn't go through the model (a meal photo, a repeat meal) into the chat, so
 * its card stays in the thread and the coach sees it in later turns.
 */
export async function recordChatTurn(
  userProfileId: string,
  userText: string,
  replyText: string,
  cards: ChatCard[],
): Promise<void> {
  await saveChatMessage(userProfileId, "user", userText);
  await saveChatMessage(userProfileId, "assistant", replyText, cards);
}

/**
 * History as API messages. Starts with a user turn; each past assistant turn ends with one note
 * per card giving its live state; messages the app posted on its own (routine and gym checks,
 * the weekly root-cause card) are marked as such; and consecutive turns of one role (an answer,
 * then a check posted by the scheduler) are merged, so the thread alternates cleanly.
 */
export function historyToMessages(
  history: Array<{ role: "user" | "assistant"; content: string; cards?: ChatCard[]; turnId?: string | null }>,
  states: CardStates = emptyCardStates(),
): Anthropic.MessageParam[] {
  const out: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const h of history) {
    if (!h.content.trim()) continue;
    if (out.length === 0 && h.role !== "user") continue;
    const cards = h.cards ?? [];
    const notes = h.role === "assistant" ? cards.map((c) => cardHistoryNote(c, states)) : [];
    const automatic = h.role === "assistant" && h.turnId === null && cards.some((c) => c.type === "workout_check" || c.type === "routine_check" || c.type === "rca");
    const body = [automatic ? "[Posted by the app on its own, not in reply to the person]" : "", h.content, ...notes].filter(Boolean).join("\n");
    const last = out.at(-1);
    if (last && last.role === h.role) last.content = `${last.content}\n\n${body}`;
    else out.push({ role: h.role, content: body });
  }
  return out;
}

const CARD_WORD = /\bcards?\b/i;
const CONFIRM_WORD = /\b(confirm|meal|food|dinner|lunch|breakfast|snack)/i;

/**
 * Drops sentences that point at a card this reply doesn't show: any card mention when there are
 * no cards, and a "confirm/log the meal card" line when no meal or activity card is attached.
 */
export function dropPhantomCardMentions(text: string, cards: ChatCard[]): string {
  const hasDraft = cards.some((c) => c.type === "meal_draft" || c.type === "activity_draft");
  if (hasDraft) return text;
  const phantom = (sentence: string): boolean =>
    CARD_WORD.test(sentence) && (cards.length === 0 || CONFIRM_WORD.test(sentence.replace(CARD_WORD, "")));
  return text
    .split(/\n/)
    .map((line) => {
      const sentences = line.match(/[^.!?]+[.!?]*\s*/g) ?? [line];
      const kept = sentences.filter((sn) => !phantom(sn));
      return kept.length === sentences.length ? line : kept.join("").trimEnd();
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type RunChatOptions = {
  create?: CreateFn;
  history?: Anthropic.MessageParam[];
  /** Client-generated id for this turn; a repeat replays or reports the earlier attempt. */
  turnId?: string;
  /** The client's page-load id, so the turn lines up with its telemetry. */
  sessionId?: string;
  /** Overrides for tests. */
  budget?: Partial<typeof TURN_BUDGET>;
  /** Streaming: progress lines and text deltas as the turn runs. The final reply is still returned. */
  onEvent?: (event: ChatStreamEvent) => void;
};

export type RunChatResult = ChatReply | { error: "in_progress"; turnId: string };

export async function runHealthChat(ctx: ActionContext, userText: string, options: RunChatOptions = {}): Promise<RunChatResult> {
  const startedAt = performance.now();
  const now = ctx.now ? ctx.now.getTime() : Date.now();
  const turnId = options.turnId ?? randomUUID();
  const stats: TurnStats = {
    turnId,
    sessionId: options.sessionId,
    models: [],
    rounds: 0,
    tools: [],
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    guardFired: false,
    cards: [],
    changed: false,
  };

  let history = options.history;
  if (!history) {
    const past = completedTurns(await loadChatHistory(ctx.userProfileId));
    const states = await loadCardStates(ctx.userProfileId, past.flatMap((h) => h.cards)).catch(() => emptyCardStates());
    history = historyToMessages(past, states);
  }

  const start = await beginTurn(ctx.userProfileId, turnId, userText, now);
  if (start.kind === "replay") {
    logTurn(ctx.userProfileId, stats, "replay", performance.now() - startedAt);
    return start.reply;
  }
  if (start.kind === "in_progress") {
    logTurn(ctx.userProfileId, stats, "in_progress", performance.now() - startedAt);
    return { error: "in_progress", turnId };
  }

  try {
    const reply = await answerTurn(ctx, userText, history, options.create ?? defaultCreate(), stats, { ...TURN_BUDGET, ...options.budget }, { onEvent: options.onEvent });
    await saveChatMessage(ctx.userProfileId, "assistant", reply.text, reply.cards, { turnId, status: "ok" });
    await setTurnStatus(ctx.userProfileId, turnId, "ok");
    logTurn(ctx.userProfileId, stats, reply.refused ? "refusal" : stats.budgetHit ? "budget" : "ok", performance.now() - startedAt);
    return { text: reply.text, cards: reply.cards, changed: reply.changed, turnId };
  } catch (err) {
    // The person's message stays in the thread marked failed (with a retry); the model never sees it.
    await setTurnStatus(ctx.userProfileId, turnId, "failed");
    logTurn(ctx.userProfileId, stats, "error", performance.now() - startedAt, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

/** The model loop for one turn: rounds of tool calls until the coach answers in text. */
/** What a turn reads and calls; evals swap these for a fixture so the model is the only live part. */
export type TurnDeps = {
  snapshot?: HealthSnapshot | null;
  details?: string | null;
  tool?: (name: string, input: unknown) => Promise<ToolOutcome>;
  onEvent?: (event: ChatStreamEvent) => void;
};

export type TurnAnswer = { text: string; cards: ChatCard[]; changed: boolean; refused: boolean };

async function answerTurn(
  ctx: ActionContext,
  userText: string,
  history: Anthropic.MessageParam[],
  create: CreateFn,
  stats: TurnStats,
  budget: typeof TURN_BUDGET = TURN_BUDGET,
  deps: TurnDeps = {},
): Promise<TurnAnswer> {
  const now = new Date(ctx.now ?? Date.now());
  // One snapshot per turn: it feeds the context block and answers get_status without a second load.
  const [details, snapshot] = await Promise.all([
    deps.details !== undefined ? Promise.resolve(deps.details) : loadPersonalDetails(ctx.userProfileId).catch(() => null),
    deps.snapshot !== undefined
      ? Promise.resolve(deps.snapshot)
      : usingLegacyPrompt()
        ? Promise.resolve(null)
        : Promise.resolve()
            .then(() => buildHealthSnapshot(ctx.userProfileId, ctx.now))
            .catch((err) => {
              logger.warn({ err: loggableError(err) }, "health chat snapshot failed; answering without the context block");
              return null;
            }),
  ]);
  const turnContext = snapshot ? buildTurnContext(snapshot, details, now) : legacyTurnContext(details, now, ctx.timezone);
  const tool = (name: string, input: unknown) =>
    name === "get_status" && snapshot && !deps.tool
      ? Promise.resolve({ result: statusForModel(snapshot) })
      : (deps.tool ?? ((n: string, i: unknown) => runTool(ctx, n, i)))(name, input);
  let model = pickChatModel(userText);
  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: "user", content: userText },
  ];
  const cards: ChatCard[] = [];
  let changed = false;
  let text = "";
  let refused = false;
  let done = false;
  const deadline = performance.now() + budget.wallMs;
  const remaining = () => deadline - performance.now();
  const abort = new AbortController();
  const abortTimer = setTimeout(() => abort.abort(), budget.wallMs);
  abortTimer.unref?.();

  try {
  for (let round = 0; round < budget.maxRounds; round++) {
    if (remaining() < budget.minCallMs) {
      stats.budgetHit = "wall";
      break;
    }
    stats.rounds += 1;
    if (stats.models.at(-1) !== model) stats.models.push(model);
    let response: Anthropic.Message;
    try {
      response = await withinBudget(
        create(
          {
            model,
            max_tokens: budget.maxTokens,
            system: [
              { type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } },
              { type: "text", text: turnContext },
            ],
            tools,
            messages,
          },
          {
            signal: abort.signal,
            timeout: Math.min(budget.callTimeoutMs, Math.max(1_000, remaining())),
            maxRetries: 1,
            ...(deps.onEvent ? { onText: (delta: string) => deps.onEvent!({ type: "delta", text: delta }) } : {}),
          },
        ),
        remaining(),
        "model",
      );
    } catch (err) {
      // Out of time mid-call: answer with what's done so far rather than failing the whole turn.
      if (err instanceof TurnBudgetExceeded || abort.signal.aborted) {
        stats.budgetHit = "wall";
        break;
      }
      throw err;
    }

    addUsage(stats, response.usage);

    if ((response.stop_reason as string) === "refusal") {
      // The fast model has no server-side fallback: retry the turn once on the main model.
      if (round === 0 && model !== healthChatModel()) {
        stats.escalated = "refusal";
        model = healthChatModel();
        round -= 1;
        continue;
      }
      text = "I can't help with that one. Ask me about your meals, steps, workouts or goal.";
      refused = true;
      done = true;
      break;
    }

    // Keep every block (thinking included) unchanged for the next request in this turn.
    messages.push({ role: "assistant", content: response.content as Anthropic.ContentBlockParam[] });
    text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      // The fast model answered a log with words only (no tool, so nothing saved): one retry on
      // the main model, which is far better at turning a plain sentence into the right tool call.
      if (model !== healthChatModel() && fastModelDodgedLog(userText, toolUses.length, round) && remaining() > budget.minCallMs) {
        stats.escalated = "no_tool";
        model = healthChatModel();
        messages.pop();
        round -= 1;
        continue;
      }
      if (response.stop_reason === "max_tokens") stats.budgetHit = "tokens";
      done = true;
      break;
    }
    if (model !== healthChatModel() && toolUses.some((tu) => COACHING_TOOLS.has(tu.name))) {
      // The fast model reached for analysis or a Hevy change: the main model writes the rest.
      stats.escalated = "coaching_tool";
      model = healthChatModel();
    }

    deps.onEvent?.({ type: "progress", text: progressLine(toolUses.map((tu) => tu.name)) });
    const results = await Promise.all(
      toolUses.map(async (tu): Promise<Anthropic.ToolResultBlockParam> => {
        const t0 = performance.now();
        try {
          const outcome = await withinBudget(tool(tu.name, tu.input), Math.min(budget.toolTimeoutMs, remaining()), "tool");
          stats.tools.push({ name: tu.name, ms: Math.round(performance.now() - t0), ok: true });
          if (outcome.card) {
            cards.push(outcome.card);
            stats.cards.push(outcome.card.type);
          }
          if (outcome.changed) changed = true;
          return { type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(outcome.result) };
        } catch (err) {
          stats.tools.push({ name: tu.name, ms: Math.round(performance.now() - t0), ok: false });
          logger.warn({ err: loggableError(err), tool: tu.name }, "health chat tool failed");
          return { type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(toolFailureResult(tu.name, err)), is_error: true };
        }
      }),
    );
    messages.push({ role: "user", content: results });

    // A meal draft needs no second model pass: the card carries the numbers, and a fixed line is
    // faster and can't claim the meal is already logged.
    if (toolUses.length === 1 && toolUses[0]!.name === "draft_activity") {
      const card = cards.find((c): c is ActivityDraftCard => c.type === "activity_draft");
      if (card) {
        text = activityDraftReply(card.draft);
        done = true;
        break;
      }
    }
    if (toolUses.every((tu) => tu.name === "draft_meal")) {
      const drafts = cards.filter((c): c is Extract<ChatCard, { type: "meal_draft" }> => c.type === "meal_draft");
      if (drafts.length === toolUses.length) {
        text = mealDraftReply(drafts.map((c) => c.draft));
        done = true;
        break;
      }
    }
  }

  } finally {
    clearTimeout(abortTimer);
  }

  stats.changed = changed;
  // The loop ended without the coach's closing reply: it ran out of rounds or time. Say so
  // plainly instead of showing a stale "let me check" line or "Done.".
  if (!done) {
    if (!stats.budgetHit) stats.budgetHit = "rounds";
    text = budgetReply(stats);
  } else if (stats.budgetHit === "tokens" && !text) {
    text = budgetReply(stats);
  }
  const guarded = dropPhantomCardMentions(text, cards);
  stats.guardFired = guarded !== text;
  text = guarded;
  if (!text) {
    text = cards.length ? "Check the card and confirm." : "Done.";
  }
  return { text, cards, changed, refused };
}

/**
 * One turn against the real model with everything else stubbed: for the eval suite. Returns the
 * reply, the tool calls the model made (in order) and the turn's stats; nothing is stored.
 */
export async function evalTurn(input: {
  userText: string;
  history?: Anthropic.MessageParam[];
  snapshot: HealthSnapshot | null;
  details: string | null;
  tool: (name: string, input: unknown) => Promise<ToolOutcome>;
  now: Date;
  timezone: string;
  create?: CreateFn;
  budget?: Partial<typeof TURN_BUDGET>;
}): Promise<{ reply: TurnAnswer; stats: TurnStats }> {
  const stats: TurnStats = {
    turnId: randomUUID(),
    models: [],
    rounds: 0,
    tools: [],
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    guardFired: false,
    cards: [],
    changed: false,
  };
  const ctx: ActionContext = { userProfileId: "eval", timezone: input.timezone, now: input.now };
  const reply = await answerTurn(ctx, input.userText, input.history ?? [], input.create ?? defaultCreate(), stats, { ...TURN_BUDGET, ...input.budget }, {
    snapshot: input.snapshot,
    details: input.details,
    tool: input.tool,
  });
  return { reply, stats };
}
