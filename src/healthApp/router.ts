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
import { clientEventsInput, clientRows, enqueueEvents, recordServerRoute } from "./events.js";
import { loadChatHistory, runHealthChat } from "./chat.js";
import { healthConnectPayload, ingestHealthConnect } from "./healthConnect.js";
import { listMealsForDate } from "./meals.js";
import { draftMealFromPhoto } from "./mealCards.js";
import { photoMealInput } from "./photoMeal.js";
import { buildHealthSnapshot, loadHealthProfile } from "./snapshot.js";
import { applyProposal, cardFromRow, discardProposal, getProposals } from "./hevyProposals.js";
import { analyzeTraining } from "./training.js";
import { HEVY_HISTORY_WEEKS, hevyHistoryCached, invalidateHevyHistory } from "./hevyHistory.js";
import { buildHealthHistory, clampDays } from "./history.js";
import {
  deleteSubscription,
  getPrefs,
  prefsInput,
  pushConfig,
  saveSubscription,
  savePrefs,
  sendNotification,
  subscriptionInput,
} from "./push.js";
import { cardFromReport, getReports, rcaResponseInput, respondToRca, runRca } from "./rca.js";
import { answerWorkoutCheck, workoutCheckAnswerInput } from "./workoutCheck.js";
import { loadCalorieReview } from "./calorieTarget.js";
import { getWorkoutChecks } from "./workoutCheckStore.js";

const chatInput = z.object({ text: z.string().trim().min(1).max(2000) });

type Locals = { userProfileId: string };
type Handler = (ctx: ActionContext, req: express.Request) => Promise<{ status?: number; body: unknown }>;

/** Wraps a handler with the user's timezone context, body validation errors and a 500 guard. */
/** Every request needs the timezone; it almost never changes, so skip the two-query lookup. */
const TZ_CACHE_MS = 10 * 60 * 1000;
const tzCache = new Map<string, { at: number; timezone: string }>();
async function cachedTimezone(userProfileId: string): Promise<string> {
  const hit = tzCache.get(userProfileId);
  if (hit && Date.now() - hit.at < TZ_CACHE_MS) return hit.timezone;
  const { timezone } = await loadHealthProfile(userProfileId);
  tzCache.set(userProfileId, { at: Date.now(), timezone });
  return timezone;
}

function route(name: string, handler: Handler): express.RequestHandler {
  return async (req, res) => {
    const { userProfileId } = res.locals as Locals;
    try {
      const timezone = await cachedTimezone(userProfileId);
      const out = await handler({ userProfileId, timezone }, req);
      res.status(out.status ?? 200).json(out.body);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: "invalid_body", issues: err.issues });
        return;
      }
      logger.error({ err: loggableError(err), route: name }, "health app route failed");
      res.locals.routeError = err instanceof Error ? err.message : String(err);
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
    "proposal_not_found",
    "proposal_discarded",
    "proposal_in_progress",
    "proposal_not_pending",
    "routine_changed_in_hevy",
    "routine_not_found",
    "report_not_found",
  ]);
  return { status: clientErrors.has(r.error ?? "") ? 400 : 500, body: r };
}

/** Hevy history takes several requests; the tracker re-reads it at most every few minutes. */
const TRAINING_CACHE_MS = 10 * 60_000;
const trainingCache = new Map<string, { at: number; body: unknown }>();

export function createHealthAppRouter(): express.Router {
  const router = express.Router();

  router.use((req, res, next) => {
    const userProfileId = authenticateHealthApp(req.get("authorization"), healthAppAuthConfig());
    if (!userProfileId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    (res.locals as Locals).userProfileId = userProfileId;
    // Server-side timing per route, written to health_app_events next to the client's view of it.
    if (req.path !== "/events") {
      const started = performance.now();
      res.on("finish", () => {
        recordServerRoute({
          userProfileId,
          route: req.route?.path ? `${req.method} ${String(req.route.path)}` : `${req.method} ${req.path}`,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: performance.now() - started,
          sessionId: req.get("x-magnus-session") ?? undefined,
          error: typeof res.locals.routeError === "string" ? res.locals.routeError : undefined,
        });
      });
    }
    next();
  });

  /** Client telemetry from the PWA: answered at once, written to the table in batches. */
  router.post("/events", (req, res) => {
    const parsed = clientEventsInput.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body" });
      return;
    }
    enqueueEvents(clientRows((res.locals as Locals).userProfileId, parsed.data, req.get("user-agent")));
    res.status(204).end();
  });

  router.get(
    "/today",
    route("today", async (ctx) => ({ body: await buildHealthSnapshot(ctx.userProfileId) })),
  );

  /** Day-by-day meals (with items), steps, burn and Hevy workouts (with sets) for the tracker. */
  router.get(
    "/history",
    route("history", async (ctx, req) => ({
      body: await buildHealthHistory(ctx.userProfileId, { days: clampDays(req.query.days) }),
    })),
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
      // Hevy proposal cards show whether they've since been applied or discarded.
      const ids = messages.flatMap((m) => m.cards.flatMap((c) => (c.type === "hevy_proposal" ? [c.proposalId] : [])));
      if (ids.length) {
        const rows = await getProposals(ctx.userProfileId, ids);
        for (const m of messages) {
          m.cards = m.cards.map((c) => {
            const row = c.type === "hevy_proposal" ? rows.get(c.proposalId) : undefined;
            return row ? cardFromRow(row) : c;
          });
        }
      }
      // Root-cause cards show whether the experiment was taken up, and how it went.
      const rcaIds = messages.flatMap((m) => m.cards.flatMap((c) => (c.type === "rca" ? [c.reportId] : [])));
      if (rcaIds.length) {
        const reports = await getReports(ctx.userProfileId, rcaIds);
        for (const m of messages) {
          m.cards = m.cards.map((c) => {
            const r = c.type === "rca" ? reports.get(c.reportId) : undefined;
            return r ? cardFromReport(r) : c;
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

  /** Photo of the plate → the same editable draft card, posted into the chat. */
  router.post(
    "/meals/photo",
    route("meal-photo", async (ctx, req) => {
      const r = await draftMealFromPhoto(ctx, photoMealInput.parse(req.body));
      return { status: r.ok ? 200 : 400, body: r };
    }),
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

  /** Adaptive calorie target: maintenance from real intake and weight trend, and the on-pace target. */
  router.get(
    "/targets/review",
    route("targets-review", async (ctx) => ({ body: await loadCalorieReview(ctx.userProfileId) })),
  );

  /** Answer to the post-gym-slot check: recheck Hevy, skipped (with reason), or trained but unlogged. */
  router.post(
    "/workout-check",
    route("workout-check", async (ctx, req) =>
      fromResult(await answerWorkoutCheck(ctx, workoutCheckAnswerInput.parse(req.body))),
    ),
  );

  /** Coach-proposed Hevy changes: nothing is written to Hevy until apply. */
  router.post(
    "/hevy/proposals/:id/apply",
    route("hevy-apply", async (ctx, req) => {
      const r = await applyProposal(ctx, String(req.params.id));
      if (r.ok) {
        trainingCache.delete(ctx.userProfileId);
        invalidateHevyHistory(ctx.userProfileId);
      }
      return fromResult(r);
    }),
  );
  router.post(
    "/hevy/proposals/:id/discard",
    route("hevy-discard", async (ctx, req) => fromResult(await discardProposal(ctx, String(req.params.id)))),
  );

  /** Web Push: the app asks for the VAPID key, then registers its subscription. */
  router.get(
    "/push",
    route("push-config", async (ctx) => ({
      body: { publicKey: pushConfig()?.publicKey ?? null, prefs: await getPrefs(ctx.userProfileId) },
    })),
  );
  router.post(
    "/push/subscribe",
    route("push-subscribe", async (ctx, req) =>
      fromResult(await saveSubscription(ctx.userProfileId, subscriptionInput.parse(req.body), req.get("user-agent"))),
    ),
  );
  router.post(
    "/push/unsubscribe",
    route("push-unsubscribe", async (ctx, req) => {
      const { endpoint } = z.object({ endpoint: z.string().url() }).parse(req.body);
      return fromResult(await deleteSubscription(ctx.userProfileId, endpoint));
    }),
  );
  router.post(
    "/push/test",
    route("push-test", async (ctx) => {
      const r = await sendNotification(ctx.userProfileId, {
        kind: "morning_plan",
        dedupeKey: `test:${Date.now()}`,
        title: "Magnus",
        body: "Notifications are on. I'll nudge you about meals, steps, workouts and your weekly review.",
        url: "/app/#coach",
      });
      return { status: r.sent ? 200 : 400, body: { ok: r.sent, ...r, error: r.reason } };
    }),
  );
  router.post(
    "/push/prefs",
    route("push-prefs", async (ctx, req) => fromResult(await savePrefs(ctx.userProfileId, prefsInput.parse(req.body)))),
  );

  /** Root-cause analysis on demand, and the person's answer to its experiment. */
  router.post(
    "/rca",
    route("rca", async (ctx) => {
      const r = await runRca(ctx.userProfileId, "manual");
      return r ? { body: { ok: true, card: cardFromReport(r.report) } } : { status: 400, body: { ok: false, error: "not_enough_data" } };
    }),
  );
  router.post(
    "/rca/:id",
    route("rca-respond", async (ctx, req) =>
      fromResult(await respondToRca(ctx, String(req.params.id), rcaResponseInput.parse(req.body).action)),
    ),
  );

  /** Training analysis for the tracker: progressing / stalled lifts over the last 8 weeks. */
  router.get(
    "/training",
    route("training", async (ctx, req) => {
      const cached = trainingCache.get(ctx.userProfileId);
      if (cached && Date.now() - cached.at < TRAINING_CACHE_MS && req.query.fresh !== "1") return { body: cached.body };
      const now = new Date();
      const h = await hevyHistoryCached(ctx.userProfileId, { fresh: req.query.fresh === "1", now });
      if (!h.connected) return { body: { connected: false, analysis: null } };
      if (!h.ok) return { status: 502, body: { error: "hevy_unavailable" } };
      const body = { connected: true, analysis: analyzeTraining(h.workouts, now, ctx.timezone, HEVY_HISTORY_WEEKS) };
      trainingCache.set(ctx.userProfileId, { at: Date.now(), body });
      return { body };
    }),
  );

  return router;
}
