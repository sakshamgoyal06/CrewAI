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

export function healthChatModel(): string {
  return process.env.MAGNUS_HEALTH_CHAT_MODEL?.trim() || "claude-opus-5-5";
}

const MAX_TOOL_ROUNDS = 6;
const HISTORY_MESSAGES = 20;

export type ChatCard = { type: "meal_draft"; draft: MealDraft };

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
- When they're off track, look for the concrete cause in the data (which check keeps failing, which days) and suggest one small, specific change.
- Keep replies short: 1 to 4 sentences, plain text, no headings. Use kg and kcal.`;

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
      },
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
  };
}

type ToolOutcome = { result: unknown; card?: ChatCard; changed?: boolean };

function invalid(err: z.ZodError): ToolOutcome {
  return { result: { ok: false, error: "invalid_input", issues: err.issues.map((i) => i.message) } };
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
