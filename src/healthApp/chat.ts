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
import { answerWorkoutCheck, workoutCheckAnswerInput, type WorkoutCheckCard } from "./workoutCheck.js";

export function healthChatModel(): string {
  return process.env.MAGNUS_HEALTH_CHAT_MODEL?.trim() || "claude-opus-5-5";
}

const MAX_TOOL_ROUNDS = 10;
const HISTORY_MESSAGES = 20;

export type ChatCard = { type: "meal_draft"; draft: MealDraft } | WorkoutCheckCard | HevyProposalCard;

export type ChatReply = {
  text: string;
  cards: ChatCard[];
  /** True when the turn wrote data, so the tracker should refresh. */
  changed: boolean;
};

const SYSTEM_PROMPT = `You are Magnus, a personal health coach inside a private app used by one person.

The person has an outcome goal (body weight, body fat %, muscle mass by a deadline) and tracks daily consistency: meals logged, calories in range, protein, steps, and workouts on training days. The north-star number is on-track days in the last 7.

How to work:
- When the person tells you something loggable, log it with a tool right away. Steps, walks, weigh-ins and targets save directly.
- Meals: call draft_meal. It returns an estimate that the app shows as an editable card. Tell them the estimate in one line and ask them to check and confirm the card. Never say a meal is logged until they confirm it.
- Several foods eaten together are one meal: pass the whole description in one draft_meal call.
- Use get_status before answering questions about progress, and quote its numbers; never invent numbers.
- If a goal or targets are missing and the question needs them, ask for them in one short question.
- Workouts: on training days the app checks Hevy a few hours after the gym slot and asks in chat if nothing is logged. When they answer (skipped and why, or trained but didn't log it), record it with answer_workout_check. If they skipped, ask why in one short question if they didn't say.
- Training (Hevy): use get_training_analysis to see what's progressing, stalled or going backwards, and get_routines for their current plan. To change Hevy (swap or add an exercise, change sets/reps/rest, create a routine, log a workout), find exercise ids with search_exercises, then call the matching propose_* tool. It shows a card they apply; nothing changes in Hevy until they do, so never say it's done. Suggest changes from the data: a lift that has stalled for 3+ weeks gets a rep-range change or a close variation, not a whole new program. Keep a routine's other exercises as they are unless asked.
- When they're off track, look for the concrete cause in the data (which check keeps failing, which days) and suggest one small, specific change.
- Keep replies short: 1 to 4 sentences, plain text, no headings. Use kg and kcal.`;

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

const tools: Anthropic.Tool[] = [
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
      "Update daily targets: calories (upper limit), protein grams (minimum), steps, and training weekdays (0 = Sunday … 6 = Saturday).",
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
    workoutChecks: s.workoutChecks,
  };
}

type ToolOutcome = { result: unknown; card?: ChatCard; changed?: boolean };

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

type CreateFn = (params: Record<string, unknown>) => Promise<Anthropic.Message>;

function defaultCreate(): CreateFn {
  return (params) =>
    // Server-side fallback re-runs a refused request on another model inside the same call.
    anthropic.beta.messages.create({
      ...params,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    } as never) as unknown as Promise<Anthropic.Message>;
}

export async function loadChatHistory(
  userProfileId: string,
  limit = HISTORY_MESSAGES,
): Promise<Array<{ role: "user" | "assistant"; content: string; cards: ChatCard[]; createdAt: string }>> {
  const { data, error } = await supabase
    .from("health_chat_messages")
    .select("role, content, cards, created_at")
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
    }));
}

async function saveChatMessage(
  userProfileId: string,
  role: "user" | "assistant",
  content: string,
  cards: ChatCard[] = [],
): Promise<void> {
  const { error } = await supabase
    .from("health_chat_messages")
    .insert({ user_profile_id: userProfileId, role, content, cards });
  if (error) {
    logger.warn({ error: error.message }, "health chat message save failed");
  }
}

/** History as API messages: must start with a user turn and alternate cleanly. */
export function historyToMessages(
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const h of history) {
    if (!h.content.trim()) continue;
    if (out.length === 0 && h.role !== "user") continue;
    out.push({ role: h.role, content: h.content });
  }
  return out;
}

export async function runHealthChat(
  ctx: ActionContext,
  userText: string,
  options: { create?: CreateFn; history?: Anthropic.MessageParam[] } = {},
): Promise<ChatReply> {
  const create = options.create ?? defaultCreate();
  const history =
    options.history ?? historyToMessages(await loadChatHistory(ctx.userProfileId));
  await saveChatMessage(ctx.userProfileId, "user", userText);

  const today = new Date(ctx.now ?? Date.now()).toISOString();
  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: "user", content: userText },
  ];
  const cards: ChatCard[] = [];
  let changed = false;
  let text = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await create({
      model: healthChatModel(),
      max_tokens: 16000,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        { type: "text", text: `Now: ${today}. Person's timezone: ${ctx.timezone}.` },
      ],
      tools,
      messages,
    });

    if ((response.stop_reason as string) === "refusal") {
      text = "I can't help with that one. Ask me about your meals, steps, workouts or goal.";
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
      break;
    }

    const results = await Promise.all(
      toolUses.map(async (tu): Promise<Anthropic.ToolResultBlockParam> => {
        try {
          const outcome = await runTool(ctx, tu.name, tu.input);
          if (outcome.card) cards.push(outcome.card);
          if (outcome.changed) changed = true;
          return { type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(outcome.result) };
        } catch (err) {
          logger.warn({ err: loggableError(err), tool: tu.name }, "health chat tool failed");
          return { type: "tool_result", tool_use_id: tu.id, content: "Tool failed.", is_error: true };
        }
      }),
    );
    messages.push({ role: "user", content: results });
  }

  if (!text) {
    text = cards.length ? "Check the card and confirm." : "Done.";
  }
  await saveChatMessage(ctx.userProfileId, "assistant", text, cards);
  return { text, cards, changed };
}
