/**
 * JSON API behind the health PWA, mounted on the Express server under `/api/health`.
 * Every route needs `Authorization: Bearer <MAGNUS_HEALTH_APP_TOKEN>`.
 */
import express from "express";
import { z } from "zod";

import { logger } from "../logger.js";
import { localDateKey } from "../nutrition/localDate.js";
import { loggableError } from "../util/loggableError.js";
import {
  checkinInput,
  confirmMeal,
  goalInput,
  logCheckin,
  logSteps,
  mealConfirmInput,
  mealDraftInput,
  removeMeal,
  setGoal,
  setTargets,
  startMealDraft,
  stepsInput,
  targetsInput,
  type ActionContext,
} from "./actions.js";
import { authenticateHealthApp, healthAppAuthConfig } from "./auth.js";
import { loadChatHistory, runHealthChat } from "./chat.js";
import { healthConnectPayload, ingestHealthConnect } from "./healthConnect.js";
import { listMealsForDate } from "./meals.js";
import { buildHealthSnapshot, loadHealthProfile } from "./snapshot.js";
import { answerWorkoutCheck, workoutCheckAnswerInput } from "./workoutCheck.js";
import { getWorkoutChecks } from "./workoutCheckStore.js";

const chatInput = z.object({ text: z.string().trim().min(1).max(2000) });

type Locals = { userProfileId: string };
type Handler = (ctx: ActionContext, req: express.Request) => Promise<{ status?: number; body: unknown }>;

/** Wraps a handler with the user's timezone context, body validation errors and a 500 guard. */
function route(name: string, handler: Handler): express.RequestHandler {
  return async (req, res) => {
    const { userProfileId } = res.locals as Locals;
    try {
      const { timezone } = await loadHealthProfile(userProfileId);
      const out = await handler({ userProfileId, timezone }, req);
      res.status(out.status ?? 200).json(out.body);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: "invalid_body", issues: err.issues });
        return;
      }
      logger.error({ err: loggableError(err), route: name }, "health app route failed");
      res.status(500).json({ error: "server_error" });
    }
  };
}

/** Maps an action result to an HTTP response: validation-style failures are 400s. */
function fromResult(r: { ok: boolean; error?: string }): { status: number; body: unknown } {
  if (r.ok) return { status: 200, body: r };
  const clientErrors = new Set([
    "future_date",
    "deadline_must_be_after_start",
    "invalid_id",
    "no_items",
    "meal session not found",
    "hevy_not_connected",
  ]);
  return { status: clientErrors.has(r.error ?? "") ? 400 : 500, body: r };
}

export function createHealthAppRouter(): express.Router {
  const router = express.Router();

  router.use((req, res, next) => {
    const userProfileId = authenticateHealthApp(req.get("authorization"), healthAppAuthConfig());
    if (!userProfileId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    (res.locals as Locals).userProfileId = userProfileId;
    next();
  });

  router.get(
    "/today",
    route("today", async (ctx) => ({ body: await buildHealthSnapshot(ctx.userProfileId) })),
  );

  router.get(
    "/chat",
    route("chat-history", async (ctx) => {
      const messages = await loadChatHistory(ctx.userProfileId, 50);
      // Workout check cards show the day's current answer, not the status they were posted with.
      const dates = messages.flatMap((m) => m.cards.flatMap((c) => (c.type === "workout_check" ? [c.date] : [])));
      if (dates.length) {
        const sorted = [...dates].sort();
        const checks = await getWorkoutChecks(ctx.userProfileId, sorted[0]!, sorted[sorted.length - 1]!);
        for (const m of messages) {
          m.cards = m.cards.map((c) => {
            const current = c.type === "workout_check" ? checks.get(c.date) : undefined;
            return current && c.type === "workout_check" ? { ...c, status: current.status, reason: current.reason } : c;
          });
        }
      }
      return { body: { messages } };
    }),
  );

  router.post(
    "/chat",
    route("chat", async (ctx, req) => {
      const { text } = chatInput.parse(req.body);
      return { body: await runHealthChat(ctx, text) };
    }),
  );

  router.post(
    "/meals/draft",
    route("meal-draft", async (ctx, req) => ({
      body: await startMealDraft(ctx, mealDraftInput.parse(req.body)),
    })),
  );

  router.post(
    "/meals/confirm",
    route("meal-confirm", async (ctx, req) =>
      fromResult(await confirmMeal(ctx, mealConfirmInput.parse(req.body))),
    ),
  );

  router.get(
    "/meals",
    route("meals", async (ctx, req) => {
      const date =
        typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
          ? req.query.date
          : localDateKey(new Date(), ctx.timezone);
      return { body: { date, meals: await listMealsForDate(ctx.userProfileId, date) } };
    }),
  );

  router.delete(
    "/meals/:id",
    route("meal-delete", async (ctx, req) => fromResult(await removeMeal(ctx, String(req.params.id)))),
  );

  /** Steps ingest: manual entry and phone automations. */
  router.post(
    "/steps",
    route("steps", async (ctx, req) => fromResult(await logSteps(ctx, stepsInput.parse(req.body)))),
  );

  /** Android: HC Webhook pushes Health Connect steps, distance, exercise and scale readings here. */
  router.post(
    "/ingest/health-connect",
    route("ingest-health-connect", async (ctx, req) =>
      fromResult(await ingestHealthConnect(ctx, healthConnectPayload.parse(req.body))),
    ),
  );

  router.post(
    "/checkins",
    route("checkin", async (ctx, req) =>
      fromResult(await logCheckin(ctx, checkinInput.parse(req.body))),
    ),
  );

  router.post(
    "/goal",
    route("goal", async (ctx, req) => fromResult(await setGoal(ctx, goalInput.parse(req.body)))),
  );

  router.post(
    "/targets",
    route("targets", async (ctx, req) =>
      fromResult(await setTargets(ctx, targetsInput.parse(req.body))),
    ),
  );

  /** Answer to the post-gym-slot check: recheck Hevy, skipped (with reason), or trained but unlogged. */
  router.post(
    "/workout-check",
    route("workout-check", async (ctx, req) =>
      fromResult(await answerWorkoutCheck(ctx, workoutCheckAnswerInput.parse(req.body))),
    ),
  );

  return router;
}
