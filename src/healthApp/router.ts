/**
 * JSON API behind the health PWA, mounted on the Express server under `/api/health`.
 * `/config` is public; every other route needs a bearer (see `accounts.ts`).
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
import {
  createPersonalToken,
  listPersonalTokens,
  publicAuthConfig,
  resolveRequestUser,
  revokePersonalToken,
} from "./accounts.js";
import { connectHevy, disconnectHevy, hevyConnected, hevyKeyInput } from "./integrations.js";
import { supabase } from "../tools/clients.js";
import { takeUse } from "./usageLimits.js";
import { deleteAccount, exportAccount } from "./privacy.js";
import {
  completeOnboarding,
  foodPrefsInput,
  isOnboarded,
  loadFoodPrefs,
  onboardingInput,
  saveFoodPrefs,
  startingPlan,
} from "./onboarding.js";
import { clientEventsInput, clientRows, enqueueEvents, recordServerRoute } from "./events.js";
import { loadChatHistory, runHealthChat } from "./chat.js";
import {
  activityDraftInput,
  activitySaveInput,
  buildActivityDraft,
  deleteActivity,
  loadActivityCatalog,
  saveActivity,
} from "./activityLog.js";
import { healthConnectPayload, ingestHealthConnect } from "./healthConnect.js";
import { listMealsForDate } from "./meals.js";
import { draftMealFromPhoto } from "./mealCards.js";
import { barcodeInput, draftMealFromBarcode } from "./barcode.js";
import { loadWeeklyReview } from "./weeklyReview.js";
import {
  applyRazorpayEvent,
  billingEnabled,
  cancelRazorpaySubscription,
  confirmInput,
  confirmRazorpayCheckout,
  createRazorpaySubscription,
  limitFor,
  loadEntitlement,
  priceLabels,
  razorpayConfig,
  verifyWebhookSignature,
} from "./billing.js";
import { getUsualMeals, repeatUsualMeal } from "./frequentMeals.js";
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
    "hevy_key_invalid",
    "activity_not_found",
  ]);
  return { status: clientErrors.has(r.error ?? "") ? 400 : 500, body: r };
}

/** Hevy history takes several requests; the tracker re-reads it at most every few minutes. */
const TRAINING_CACHE_MS = 10 * 60_000;
const trainingCache = new Map<string, { at: number; body: unknown }>();

/** Today's cap for an AI route: the free plan's allowance, or the normal cap. */
async function allowUse(ctx: { userProfileId: string; timezone: string }, action: "chat" | "photo"): Promise<true | "daily_limit" | "free_limit"> {
  const ent = billingEnabled() ? await loadEntitlement(ctx.userProfileId) : null;
  const limit = ent ? limitFor(ent.tier, action) : undefined;
  if (takeUse(ctx.userProfileId, action, localDateKey(new Date(), ctx.timezone), process.env, limit)) return true;
  return limit !== undefined ? "free_limit" : "daily_limit";
}

export function createHealthAppRouter(): express.Router {
  const router = express.Router();

  /** What the sign-in screen needs before there is a session. */
  router.get("/config", (_req, res) => {
    res.json({ auth: publicAuthConfig() });
  });

  /** Razorpay subscription webhooks (raw body, signed with the webhook secret). */
  router.post("/billing/razorpay/webhook", async (req, res) => {
    const cfg = razorpayConfig();
    const signature = req.get("x-razorpay-signature") ?? "";
    const raw = Buffer.isBuffer(req.body) ? req.body : null;
    if (!cfg?.webhookSecret || !raw || !verifyWebhookSignature(raw, signature, cfg.webhookSecret)) {
      res.status(400).json({ error: "invalid_signature" });
      return;
    }
    try {
      const result = await applyRazorpayEvent(JSON.parse(raw.toString("utf8")), cfg);
      res.json({ ok: true, result });
    } catch (err) {
      logger.error({ err: (err as Error).message }, "razorpay webhook failed");
      res.status(500).json({ error: "webhook_failed" });
    }
  });

  router.use(async (req, res, next) => {
    const auth = await resolveRequestUser(req.get("authorization"), {
      timezone: req.get("x-magnus-timezone") ?? undefined,
    });
    if ("error" in auth) {
      res.status(auth.error === "signup_closed" ? 403 : 401).json({ error: auth.error });
      return;
    }
    const { userProfileId } = auth;
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

  /** The signed-in account: who it is and what's connected. */
  router.get(
    "/account",
    route("account", async (ctx) => {
      const [{ data }, hevy, tokens] = await Promise.all([
        supabase.from("user_profile").select("display_name, email").eq("id", ctx.userProfileId).maybeSingle(),
        hevyConnected(ctx.userProfileId),
        listPersonalTokens(ctx.userProfileId),
      ]);
      return {
        body: {
          onboarded: await isOnboarded(ctx.userProfileId),
          name: data?.display_name ?? null,
          email: data?.email ?? null,
          timezone: ctx.timezone,
          hevyConnected: hevy,
          tokens,
          food: await loadFoodPrefs(ctx.userProfileId).catch(() => null),
        },
      };
    }),
  );

  /** Diet and foods to avoid, editable any time from Settings. */
  router.put(
    "/account/food",
    route("account-food", async (ctx, req) => {
      const r = await saveFoodPrefs(ctx.userProfileId, foodPrefsInput.parse(req.body));
      return r.ok ? { body: r } : { status: 500, body: r };
    }),
  );

  /** The plan the interview answers would give, without saving anything (live preview). */
  router.post(
    "/onboarding/preview",
    route("onboarding-preview", async (ctx, req) => {
      const input = onboardingInput.parse(req.body);
      return { body: { ok: true, plan: startingPlan(input, localDateKey(new Date(), ctx.timezone)) } };
    }),
  );

  /** Saves the interview: profile, first weigh-in, goal, targets, and a welcome in chat. */
  router.post(
    "/onboarding",
    route("onboarding", async (ctx, req) => {
      const r = await completeOnboarding(ctx, onboardingInput.parse(req.body));
      return r.ok ? { body: r } : fromResult(r);
    }),
  );

  /** Everything Magnus holds about the person, as one JSON download. */
  router.get(
    "/account/export",
    route("account-export", async (ctx) => ({ body: await exportAccount(ctx.userProfileId) })),
  );

  /** Deletes the account and all its data. The body must say `{ "confirm": "DELETE" }`. */
  router.delete(
    "/account",
    route("account-delete", async (ctx, req) => {
      z.object({ confirm: z.literal("DELETE") }).parse(req.body ?? {});
      const r = await deleteAccount(ctx.userProfileId);
      return r.ok ? { body: r } : { status: r.error === "owner_account" ? 400 : 500, body: r };
    }),
  );

  /** A personal token for a phone automation (Health Connect webhook). Shown once. */
  router.post(
    "/account/tokens",
    route("token-create", async (ctx, req) => {
      const { label } = z.object({ label: z.string().trim().min(1).max(60).optional() }).parse(req.body ?? {});
      return { body: { ok: true, token: await createPersonalToken(ctx.userProfileId, label) } };
    }),
  );

  router.delete(
    "/account/tokens/:id",
    route("token-revoke", async (ctx, req) => {
      const id = z.string().uuid().safeParse(req.params.id);
      if (!id.success) return { status: 400, body: { ok: false, error: "invalid_id" } };
      const ok = await revokePersonalToken(ctx.userProfileId, id.data);
      return ok ? { body: { ok: true } } : { status: 404, body: { ok: false, error: "token_not_found" } };
    }),
  );

  router.post(
    "/integrations/hevy",
    route("hevy-connect", async (ctx, req) => fromResult(await connectHevy(ctx.userProfileId, hevyKeyInput.parse(req.body)))),
  );

  router.delete(
    "/integrations/hevy",
    route("hevy-disconnect", async (ctx) => fromResult(await disconnectHevy(ctx.userProfileId))),
  );

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
      const allowed = await allowUse(ctx, "chat");
      if (allowed !== true) return { status: 429, body: { error: allowed } };
      return { body: await runHealthChat(ctx, text) };
    }),
  );

  /** Activities outside Hevy (swim, run, sports): the quick-add list, estimates, save and delete. */
  router.get(
    "/activities/catalog",
    route("activities-catalog", async (ctx) => ({ body: await loadActivityCatalog(ctx) })),
  );

  router.post(
    "/activities/draft",
    route("activity-draft", async (ctx, req) => {
      const r = await buildActivityDraft(ctx, activityDraftInput.parse({ source: "quick_add", ...req.body }));
      return "ok" in r ? fromResult(r) : { body: r };
    }),
  );

  router.post(
    "/activities",
    route("activity-save", async (ctx, req) => fromResult(await saveActivity(ctx, activitySaveInput.parse(req.body)))),
  );

  router.delete(
    "/activities/:id",
    route("activity-delete", async (ctx, req) => {
      const r = await deleteActivity(ctx, String(req.params.id));
      return r.ok ? { body: r } : r.error === "activity_not_found" ? { status: 404, body: r } : fromResult(r);
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
      const input = photoMealInput.parse(req.body);
      const allowed = await allowUse(ctx, "photo");
      if (allowed !== true) return { status: 429, body: { ok: false, error: allowed } };
      const r = await draftMealFromPhoto(ctx, input);
      return { status: r.ok ? 200 : 400, body: r };
    }),
  );

  /** Barcode on a packet → the label's numbers as a draft card in the chat. */
  router.post(
    "/meals/barcode",
    route("meal-barcode", async (ctx, req) => {
      const r = await draftMealFromBarcode(ctx, barcodeInput.parse(req.body));
      const status = r.ok ? 200 : r.error === "barcode_not_found" ? 404 : 502;
      return { status, body: r };
    }),
  );

  /** Meals logged again and again, best match for the time of day first. */
  router.get(
    "/meals/usual",
    route("meals-usual", async (ctx) => ({ body: await getUsualMeals(ctx) })),
  );

  /** One tap on a usual meal → a fresh draft card in the chat, to confirm. */
  router.post(
    "/meals/repeat",
    route("meal-repeat", async (ctx, req) => {
      const { key } = z.object({ key: z.string().trim().min(1).max(500) }).parse(req.body);
      const r = await repeatUsualMeal(ctx, key);
      return { status: r.ok ? 200 : 404, body: r };
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

  /** Plan, trial and what can be bought. */
  router.get(
    "/billing",
    route("billing", async (ctx) => {
      const cfg = razorpayConfig();
      return {
        body: {
          enabled: billingEnabled(),
          entitlement: await loadEntitlement(ctx.userProfileId),
          prices: priceLabels(),
          razorpay: cfg ? { keyId: cfg.keyId } : null,
          freeLimits: { chat: limitFor("free", "chat", { ...process.env, MAGNUS_BILLING: "on" }), photo: limitFor("free", "photo", { ...process.env, MAGNUS_BILLING: "on" }) },
        },
      };
    }),
  );

  router.post(
    "/billing/razorpay/subscribe",
    route("billing-subscribe", async (ctx, req) => {
      const { plan } = z.object({ plan: z.enum(["monthly", "yearly"]) }).parse(req.body);
      const cfg = razorpayConfig();
      if (!cfg) return { status: 503, body: { ok: false, error: "billing_unavailable" } };
      const r = await createRazorpaySubscription(ctx.userProfileId, plan, cfg);
      return { status: r.ok ? 200 : 502, body: r };
    }),
  );

  router.post(
    "/billing/razorpay/confirm",
    route("billing-confirm", async (ctx, req) => {
      const cfg = razorpayConfig();
      if (!cfg) return { status: 503, body: { ok: false, error: "billing_unavailable" } };
      const r = await confirmRazorpayCheckout(ctx.userProfileId, confirmInput.parse(req.body), cfg);
      return { status: r.ok ? 200 : 400, body: r };
    }),
  );

  router.post(
    "/billing/cancel",
    route("billing-cancel", async (ctx) => {
      const cfg = razorpayConfig();
      if (!cfg) return { status: 503, body: { ok: false, error: "billing_unavailable" } };
      const r = await cancelRazorpaySubscription(ctx.userProfileId, cfg);
      return { status: r.ok ? 200 : 400, body: r };
    }),
  );

  /** The last 7 days vs targets and goal, compared with the week before, and next week's focus. */
  router.get(
    "/review/week",
    route("review-week", async (ctx) => ({ body: await loadWeeklyReview(ctx.userProfileId) })),
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
