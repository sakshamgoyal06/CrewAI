/**
 * JSON API behind the health PWA, mounted on the Express server under `/api/health`.
 * `/config` is public; every other route needs a bearer (see `accounts.ts`).
 */
import { setMinimumDay } from "./minimumDayStore.js";
import { cancelEvent, groceryPreview, planEvent, undoGapDefaults } from "./dietPlan/store.js";
import express from "express";
import { z } from "zod";

import { logger } from "../logger.js";
import { localDateKey } from "../nutrition/localDate.js";
import { loggableError } from "../util/loggableError.js";
import { checkFoodQuery, cleanLookupItems } from "./foodLookup.js";
import { searchFoods, type FoodPick } from "./foodPick.js";
import { approveLookup, recordLookup, saveOwnFood, searchMyFoods, type MyFood } from "./myFoods.js";
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
  isOwnerProfile,
  isOwnerProfileRow,
  replacePersonalToken,
  resetOwnAccount,
  listPersonalTokens,
  publicAuthConfig,
  resolveRequestUser,
  revokePersonalToken,
  scopeAllows,
} from "./accounts.js";
import { failedAuthLimiter, userRequestLimiter } from "./rateLimit.js";
import { connectHevy, disconnectHevy, hevyConnected, hevyKeyInput } from "./integrations.js";
import { supabase } from "../tools/clients.js";
import { needsSeed, seedUse, takeUse, type LimitedAction } from "./usageLimits.js";
import { needsSpendSeed, seedSpend, spendMode, spentSince, type SpendMode } from "./spend.js";
import { disabledResponse, isAccountDisabled } from "./accountStatus.js";
import { usedSince } from "./usageSeed.js";
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
import { loadChatHistory, runHealthChat, stopChatTurn, type ChatStreamEvent } from "./chat.js";
import { alertOwnerCoachOffline, COACH_OFFLINE_MESSAGE, isCoachOffline } from "./coachOffline.js";
import { hydrateCard, loadCardStates, mealDaysOf } from "./chatCards.js";
import { cardAt } from "./cardDay.js";
import { isDateKey, listChatDays, localDayRange, tryDayPlan } from "./dailyChat.js";
import { editLine, forgetLine, loadCoachMemory, MEMORY_MAX_CHARS, MEMORY_MAX_LINES, memoryToday, rememberLine, ruleKind } from "./coachMemory.js";
import { inPlanUntil, loadRuleSpans } from "./memoryRules.js";
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
import { editInput, editPick, restrictionsFor, searchMealFoods } from "./dietPlan/edit.js";
import { eatInput, eatPlanned, eatRestAsPlanned, skipPlanned, undoPlanned } from "./dietPlan/log.js";
import { editReceipt, getLoggedMeal, mealReplaceInput, receiptEditInput, replaceLoggedMeal, undoReceipt } from "./logEdits.js";
import { logSupplements, undoSupplements } from "./dietPlan/supplementLog.js";
import { confirmDayComplete, rebalanceToday, redoCarry, setMealPlanRole } from "./dietPlan/rhythm.js";
import { GAP_CHOICES } from "./dietPlan/proteinGap.js";
import { acceptPlanGaps, answerProteinGap, FEEDBACK_REASONS, loadDietPrefs, loadPlanView, markOption, mealFeedback, OPTION_ACTIONS, planGapLine, prefsChangeReason, rebuildPlan, saveDietPrefs, swapPick } from "./dietPlan/store.js";
import { replanForGoal } from "./replan.js";
import { getActiveGoal, saveGoalWhy } from "./bodyStore.js";
import { PLAN_SLOTS } from "./dietPlan/targets.js";
import {
  applyRazorpayEvent,
  billingEnabled,
  billingMode,
  forgetEntitlement,
  experienceFor,
  hasFeature,
  PREVIEW_STATES,
  previewEntitlement,
  priceAmounts,
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
import { getUsualMeals, repeatUsualMeal, yesterdaysMeal } from "./frequentMeals.js";
import { photoMealInput } from "./photoMeal.js";
import { preparePhotoForVision } from "./photoImage.js";
import { buildHealthSnapshot, loadHealthProfile } from "./snapshot.js";
import { liftingGap, routineInput } from "./routine.js";
import { answerRoutineCheck, routineCheckAnswerInput, setRoutine } from "./routineCheck.js";
import { applyProposal, discardProposal } from "./hevyProposals.js";
import { analyzeTraining } from "./training.js";
import { TRAINING_ANALYSIS_WEEKS, hevyHistoryCached, invalidateHevyHistory } from "./hevyHistory.js";
import { buildHealthHistory, clampDays } from "./history.js";
import {
  deleteSubscription,
  getPrefs,
  prefsInput,
  pushConfig,
  recordReceipt,
  saveSubscription,
  savePrefs,
  sendNotification,
  subscriptionInput,
} from "./push.js";
import { cardFromReport, rcaResponseInput, respondToRca, runRca } from "./rca.js";
import { answerWorkoutCheck, workoutCheckAnswerInput } from "./workoutCheck.js";
import { logWater, waterInput } from "./water.js";
import { importMfp, mfpImportInput } from "./mfpImport.js";
import { eatingOutInput, planEatingOut } from "./eatingOut.js";
import { loadCalorieReview } from "./calorieTarget.js";
import { cardFromIntervention, checkNewGoal, recordManualPlan, respond as respondToIntervention, revertToVersion } from "./interventions/engine.js";
import { listVersions } from "./interventions/plan.js";
import { listInterventions } from "./interventions/store.js";
import { activeBreaks, breakInput, endBreakEarly, previewBreak, startBreak, loadBreaks, BREAK_REASONS } from "./breaks.js";
import { keepDateAccept, keepDatePreview, pendingResume, resumeMoveDate, resumeState } from "./resume.js";

const chatInput = z.object({ text: z.string().trim().min(1).max(2000), turnId: z.string().uuid().optional() });

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
      const offline = isCoachOffline(err);
      if (offline) void alertOwnerCoachOffline();
      logger.error({ err: loggableError(err), route: name, coachOffline: offline || undefined }, offline ? "model provider account unusable (credit or key)" : "health app route failed");
      res.locals.routeError = err instanceof Error ? err.message : String(err);
      res.status(offline ? 503 : 500).json({ error: offline ? "coach_offline" : "server_error" });
    }
  };
}

/** Maps an action result to an HTTP response: validation-style failures are 400s. */
function fromResult(r: { ok: boolean; error?: string; [k: string]: unknown }): { status: number; body: unknown } {
  if (r.ok) return { status: 200, body: r };
  const clientErrors = new Set([
    "future_date",
    "deadline_must_be_after_start",
    "unsafe_pace",
    "invalid_id",
    "no_items",
    "meal session not found",
    "hevy_not_connected",
    "proposal_not_found",
    "proposal_discarded",
    "proposal_expired",
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

/** Today's chat spend mode for this person (spend.ts): full coach, fast model only, or stopped. */
async function chatSpendMode(ctx: { userProfileId: string; timezone: string }): Promise<SpendMode> {
  const day = localDateKey(new Date(), ctx.timezone);
  if (needsSpendSeed(ctx.userProfileId, day)) seedSpend(ctx.userProfileId, day, await spentSince(ctx.userProfileId, localDayRange(day, ctx.timezone).from));
  return spendMode(ctx.userProfileId, day);
}

/** What a paused account may still do: see the account, export or delete it, and cancel a plan. */
const PAUSED_ALLOWED = new Set(["GET /account", "GET /account/export", "DELETE /account", "GET /billing", "POST /billing/cancel"]);

const BUSY_MESSAGE = "One message at a time: I'm still answering your last one.";

/** Hevy history takes several requests; the tracker re-reads it at most every few minutes. */
const TRAINING_CACHE_MS = 10 * 60_000;
const trainingCache = new Map<string, { at: number; body: unknown }>();

/** Today's cap for an AI route: the free plan's allowance, or the normal cap. */
async function allowUse(ctx: { userProfileId: string; timezone: string }, action: LimitedAction): Promise<true | "daily_limit" | "free_limit"> {
  const ent = billingEnabled() && (action === "chat" || action === "photo") ? await loadEntitlement(ctx.userProfileId) : null;
  const limit = ent && (action === "chat" || action === "photo") ? limitFor(ent.tier, action) : undefined;
  const day = localDateKey(new Date(), ctx.timezone);
  if (needsSeed(ctx.userProfileId, action, day)) {
    seedUse(ctx.userProfileId, action, day, await usedSince(ctx.userProfileId, action, localDayRange(day, ctx.timezone).from));
  }
  if (takeUse(ctx.userProfileId, action, day, process.env, limit)) return true;
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

  /** The service worker says a push reached the phone (no session in a service worker). */
  router.post("/push/receipt", (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    void recordReceipt(b.id, b.shown, b.error);
    res.status(204).end();
  });

  router.use(async (req, res, next) => {
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    if (failedAuthLimiter.blocked(ip)) {
      res.status(429).json({ error: "too_many_requests" });
      return;
    }
    const auth = await resolveRequestUser(req.get("authorization"), {
      timezone: req.get("x-magnus-timezone") ?? undefined,
    });
    if ("error" in auth) {
      if (auth.error === "unauthorized") failedAuthLimiter.take(ip);
      res.status(auth.error === "signup_closed" ? 403 : 401).json({ error: auth.error });
      return;
    }
    const { userProfileId } = auth;
    // Device tokens only send data in; everything else needs the signed-in person.
    if (!scopeAllows(auth.scope, req.method, req.path)) {
      res.status(403).json({ error: "token_scope" });
      return;
    }
    if (!userRequestLimiter.take(userProfileId)) {
      res.status(429).json({ error: "too_many_requests" });
      return;
    }
    // A paused account (repeated off-topic use) gets a review-request draft instead of the app.
    // It can still see its account, take its data out, delete it, and stop a paid plan.
    if (!PAUSED_ALLOWED.has(`${req.method} ${req.path.replace(/\/+$/, "")}`) && (await isAccountDisabled(userProfileId))) {
      res.status(403).json(disabledResponse(userProfileId));
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

  /** Whose account a token belongs to: the Android app asks before it starts syncing to it. */
  router.get(
    "/whoami",
    route("whoami", async (ctx) => {
      const { data } = await supabase.from("user_profile").select("display_name, email").eq("id", ctx.userProfileId).maybeSingle();
      return { body: { name: data?.display_name ?? null, email: data?.email ?? null } };
    }),
  );

  /** The signed-in account: who it is and what's connected. */
  router.get(
    "/account",
    route("account", async (ctx) => {
      // All five reads at once: done one after another they made this screen take about a second.
      const [{ data }, hevy, tokens, onboarded, food] = await Promise.all([
        supabase.from("user_profile").select("display_name, email").eq("id", ctx.userProfileId).maybeSingle(),
        hevyConnected(ctx.userProfileId),
        listPersonalTokens(ctx.userProfileId),
        isOnboarded(ctx.userProfileId),
        loadFoodPrefs(ctx.userProfileId).catch(() => null),
      ]);
      return {
        body: {
          onboarded,
          name: data?.display_name ?? null,
          email: data?.email ?? null,
          owner: isOwnerProfileRow(ctx.userProfileId, data?.email),
          timezone: ctx.timezone,
          hevyConnected: hevy,
          tokens,
          food,
        },
      };
    }),
  );

  /** Diet and foods to avoid, editable any time from Settings. */
  router.put(
    "/account/food",
    route("account-food", async (ctx, req) => {
      const r = await saveFoodPrefs(ctx.userProfileId, foodPrefsInput.parse(req.body));
      // The plan was built from the old diet, note and avoid list: build it again so nothing they just ruled out stays on it.
      if (r.ok) await rebuildPlan(ctx, "food_prefs_changed").catch(() => null);
      return r.ok ? { body: r } : { status: 500, body: r };
    }),
  );

  /** Diet plan: the Meals tab (setup answers, plan version, 3-day picks). */
  router.get(
    "/diet/plan",
    route("diet-plan", async (ctx) => {
      const r = await loadPlanView(ctx);
      return r.ok ? { body: r } : { status: 409, body: r };
    }),
  );
  router.get(
    "/diet/prefs",
    route("diet-prefs", async (ctx) => {
      const r = await loadDietPrefs(ctx.userProfileId);
      return { body: { ok: true, ...r } };
    }),
  );
  /** Saves the setup answers and builds a new plan from them. */
  router.put(
    "/diet/prefs",
    route("diet-prefs-save", async (ctx, req) => {
      const before = await loadDietPrefs(ctx.userProfileId);
      const prefs = await saveDietPrefs(ctx.userProfileId, req.body);
      const r = await rebuildPlan(ctx, before.saved ? prefsChangeReason(before.prefs, prefs) : "prefs_changed");
      // Saved without targets: the answers are kept and the plan builds once targets are set.
      if (!r.ok && r.error === "no_targets") return { body: { ok: true, prefs, version: null, needsTargets: true } };
      return r.ok ? { body: { ok: true, prefs, version: r.plan.version, proteinGap: await planGapLine(ctx) } } : { status: 409, body: r };
    }),
  );
  router.post(
    "/diet/plan/rebuild",
    route("diet-rebuild", async (ctx) => {
      const r = await rebuildPlan(ctx, "rebuild");
      return r.ok ? { body: { ok: true, version: r.plan.version, proteinGap: await planGapLine(ctx) } } : { status: 409, body: r };
    }),
  );
  router.post(
    "/diet/options/:id",
    route("diet-option-mark", async (ctx, req) => {
      const { action } = z.object({ action: z.enum(OPTION_ACTIONS) }).parse(req.body);
      const id = z.string().regex(/^opt_[a-z]+_[0-9a-f]{12}$/).parse(req.params.id);
      const r = await markOption(ctx.userProfileId, id, action);
      return { body: { ok: true, pinned: r.pinned, liked: r.liked, hidden: r.hidden } };
    }),
  );
  router.post(
    "/diet/days/:date/:slot/swap",
    route("diet-swap", async (ctx, req) => {
      const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.params.date);
      const slot = z.enum(PLAN_SLOTS).parse(req.params.slot);
      const { optionId } = z.object({ optionId: z.string().min(1).max(40) }).parse(req.body);
      const r = await swapPick(ctx, date, slot, optionId);
      return r.ok ? { body: r } : { status: 400, body: r };
    }),
  );

  /** Why a planned meal is being swapped; "don't cook" and "too much effort" are remembered, the rest last a day. */
  router.post(
    "/diet/days/:date/:slot/feedback",
    route("diet-feedback", async (ctx, req) => {
      const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.params.date);
      const slot = z.enum(PLAN_SLOTS).parse(req.params.slot);
      const { reason } = z.object({ reason: z.enum(FEEDBACK_REASONS) }).parse(req.body);
      const r = await mealFeedback(ctx, date, slot, reason);
      return r.ok ? { body: r } : { status: 400, body: r };
    }),
  );

  /** The meal editor: save a planned meal's items (portions, removed items, added foods). */
  router.put(
    "/diet/days/:date/:slot/items",
    route("diet-edit", async (ctx, req) => {
      const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.params.date);
      const slot = z.enum(PLAN_SLOTS).parse(req.params.slot);
      const r = await editPick(ctx, date, slot, editInput.parse(req.body));
      return r.ok ? { body: r } : { status: 400, body: r };
    }),
  );
  /** Foods to add to a meal, already filtered by the person's diet, avoid list and meat limits. */
  router.get(
    "/diet/foods",
    route("diet-foods", async (ctx, req) => {
      const q = z.string().max(60).default("").parse(req.query.q ?? "");
      const slot = z.enum(PLAN_SLOTS).parse(req.query.slot);
      const [allows, mine] = await Promise.all([restrictionsFor(ctx.userProfileId, localDateKey(new Date(), ctx.timezone)), searchMyFoods(ctx.userProfileId, q)]);
      // Saved foods first (their own and approved web foods, checked against the diet by name), then the catalog.
      const own = mine.filter((f) => allows.byName(f.name)).map(myFoodHit);
      const foods = [...own, ...searchMealFoods(q, slot, allows)].slice(0, 14);
      return { body: { ok: true, foods } };
    }),
  );

  /** "Ate this" on a planned meal, with any portion changes; and its undo. */
  router.post(
    "/diet/days/:date/:slot/eat",
    route("diet-eat", async (ctx, req) => {
      const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.params.date);
      const slot = z.enum(PLAN_SLOTS).parse(req.params.slot);
      const r = await eatPlanned(ctx, date, slot, eatInput.parse(req.body ?? {}));
      // Ate more or less than planned: the rest of today follows (before the reply, so the tab shows it).
      if (r.ok && r.status === "partial") await rebalanceToday(ctx).catch((err) => logger.warn({ err: loggableError(err) }, "rebalance failed"));
      return r.ok ? { body: r } : { status: r.error === "already_logged" || r.error === "too_early" ? 409 : 400, body: r };
    }),
  );
  /** "Rest of today as planned": the meals still planned (and due) logged in one tap. */
  router.post(
    "/diet/days/:date/eat-rest",
    route("diet-eat-rest", async (ctx, req) => {
      const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.params.date);
      const r = await eatRestAsPlanned(ctx, date);
      return r.ok ? { body: r } : { status: 400, body: r };
    }),
  );
  /** "Took my supplements": logs the day's supplements from the plan setup (idempotent). */
  router.post(
    "/diet/supplements/:date",
    route("diet-supplements-log", async (ctx, req) => {
      const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.params.date);
      const r = await logSupplements(ctx, date);
      return r.ok ? { body: r } : { status: 400, body: r };
    }),
  );
  router.delete(
    "/diet/supplements/:date",
    route("diet-supplements-undo", async (ctx, req) => {
      const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.params.date);
      const r = await undoSupplements(ctx, date);
      return r.ok ? { body: r } : { status: 400, body: r };
    }),
  );
  /** "It was extra" / "Count it as my snack": a logged meal leaves, or takes, its planned meal's place. */
  router.post(
    "/meals/:id/plan",
    route("meal-plan-role", async (ctx, req) => {
      const id = z.string().uuid().parse(req.params.id);
      const { role } = z.object({ role: z.enum(["extra", "instead", "replace"]) }).parse(req.body ?? {});
      const r = await setMealPlanRole(ctx, id, role);
      return r.ok ? { body: r } : { status: r.error === "not_found" ? 404 : 409, body: r };
    }),
  );
  router.post(
    "/diet/days/:date/:slot/undo",
    route("diet-undo", async (ctx, req) => {
      const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.params.date);
      const slot = z.enum(PLAN_SLOTS).parse(req.params.slot);
      const r = await undoPlanned(ctx, date, slot);
      return r.ok ? { body: r } : { status: 400, body: r };
    }),
  );

  /** "Skipped it": they didn't eat this planned meal; it counts as a logged 0. Undo is the route above. */
  router.post(
    "/diet/days/:date/:slot/skip",
    route("diet-skip", async (ctx, req) => {
      const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.params.date);
      const slot = z.enum(PLAN_SLOTS).parse(req.params.slot);
      const r = await skipPlanned(ctx, date, slot);
      if (r.ok) {
        // Today the rest of the day follows; an earlier, closed day redoes its carry.
        if (date === localDateKey(new Date(), ctx.timezone)) await rebalanceToday(ctx).catch((err) => logger.warn({ err: loggableError(err) }, "rebalance after skip failed"));
        else await redoCarry(ctx, date).catch((err) => logger.warn({ err: loggableError(err) }, "carry redo after skip failed"));
      }
      return r.ok ? { body: r } : { status: r.error === "already_logged" ? 409 : 400, body: r };
    }),
  );

  /** The plan can't reach their protein target under their rules: accept, supplement, or loosen a rule. */
  router.post(
    "/diet/protein-gap",
    route("diet-protein-gap", async (ctx, req) => {
      const { choice } = z.object({ choice: z.enum(GAP_CHOICES) }).parse(req.body ?? {});
      const r = await answerProteinGap(ctx, choice);
      return r.ok ? { body: r } : { status: 400, body: r };
    }),
  );
  /** Pauses (breaks.ts): what's running or coming up, and a whole-plan pause waiting for its restart choice. */
  router.get(
    "/breaks",
    route("breaks", async (ctx) => {
      const today = localDateKey(new Date(), ctx.timezone);
      const all = await loadBreaks(ctx.userProfileId, today);
      return { body: { ok: true, breaks: all.filter((b) => b.endDate >= today), resume: pendingResume(all, today)?.id ?? null, reasons: BREAK_REASONS } };
    }),
  );
  router.post(
    "/breaks/preview",
    route("breaks-preview", async (ctx, req) => {
      const input = breakInput.pick({ scope: true, reason: true, itemId: true }).parse(req.body ?? {});
      const r = await previewBreak(ctx, input);
      return "ok" in r ? { status: 400, body: r } : { body: { ok: true, ...r } };
    }),
  );
  router.post(
    "/breaks",
    route("breaks-start", async (ctx, req) => {
      const r = await startBreak(ctx, breakInput.parse(req.body ?? {}));
      return r.ok ? { body: r } : { status: 400, body: r };
    }),
  );
  router.post(
    "/breaks/:id/end",
    route("breaks-end", async (ctx, req) => {
      const id = z.string().uuid().parse(req.params.id);
      const r = await endBreakEarly(ctx.userProfileId, id, localDateKey(new Date(), ctx.timezone));
      return r.ok ? { body: { ...r, active: await activeBreaks(ctx) } } : { status: 400, body: r };
    }),
  );
  /** The way back from a whole-plan pause (resume.ts). */
  router.get(
    "/resume",
    route("resume", async (ctx, req) => {
      const id = typeof req.query.id === "string" ? z.string().uuid().parse(req.query.id) : undefined;
      const r = await resumeState(ctx, id);
      return r.ok ? { body: r } : { status: 404, body: r };
    }),
  );
  router.post(
    "/resume/:id/move-date",
    route("resume-move-date", async (ctx, req) => {
      const id = z.string().uuid().parse(req.params.id);
      const r = await resumeMoveDate(ctx, id, async (t) => (await setTargets(ctx, t)).ok);
      return r.ok ? { body: r } : { status: 400, body: r };
    }),
  );
  router.post(
    "/resume/:id/keep-date/preview",
    route("resume-keep-preview", async (ctx, req) => {
      const id = z.string().uuid().parse(req.params.id);
      const { weightKg } = z.object({ weightKg: z.coerce.number().min(25).max(350).optional() }).parse(req.body ?? {});
      const r = await keepDatePreview(ctx, id, weightKg);
      return r.ok ? { body: r } : { status: 400, body: r };
    }),
  );
  router.post(
    "/resume/:id/keep-date/accept",
    route("resume-keep-accept", async (ctx, req) => {
      const id = z.string().uuid().parse(req.params.id);
      const r = await keepDateAccept(ctx, id);
      return r.ok ? { body: r } : { status: 400, body: r };
    }),
  );
  /** The next 7 days of the plan as a grocery list (dietPlan/grocery.ts). */
  router.get(
    "/diet/grocery",
    route("diet-grocery", async (ctx) => {
      const r = await groceryPreview(ctx);
      return r.ok ? { body: r } : { status: 404, body: r };
    }),
  );
  /** An event planned ahead (a wedding dinner): that meal becomes an allowance sized for it. */
  router.post(
    "/diet/events",
    route("diet-event", async (ctx, req) => {
      const input = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), slot: z.enum(PLAN_SLOTS), label: z.string().trim().min(1).max(40) }).parse(req.body ?? {});
      const r = await planEvent(ctx, input);
      return r.ok ? { body: r } : { status: 400, body: r };
    }),
  );
  router.post(
    "/diet/events/cancel",
    route("diet-event-cancel", async (ctx, req) => {
      const input = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), slot: z.enum(PLAN_SLOTS) }).parse(req.body ?? {});
      const r = await cancelEvent(ctx, input.date, input.slot);
      return r.ok ? { body: r } : { status: 404, body: r };
    }),
  );
  /** Undo on the answer Magnus gave the plan's gaps by default (12 Nov plan, item 7). */
  router.post(
    "/diet/plan-gaps/undo",
    route("diet-plan-gaps-undo", async (ctx) => {
      const r = await undoGapDefaults(ctx);
      return r.ok ? { body: r } : { status: 400, body: r };
    }),
  );
  /** "Keep this plan": the plan's other gaps (calories, carbs, fat, fibre) accepted until the food rules change. */
  router.post(
    "/diet/plan-gaps/accept",
    route("diet-plan-gaps-accept", async (ctx) => {
      const r = await acceptPlanGaps(ctx);
      return r.ok ? { body: r } : { status: 400, body: r };
    }),
  );

  /** Minimum day ("bad day" mode, minimumDay.ts): today or yesterday, on or off. */
  router.post(
    "/days/:date/minimum",
    route("day-minimum", async (ctx, req) => {
      const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.params.date);
      const { on } = z.object({ on: z.boolean() }).parse(req.body ?? {});
      const { targets } = await loadHealthProfile(ctx.userProfileId);
      const r = await setMinimumDay(ctx.userProfileId, date, on, localDateKey(new Date(), ctx.timezone), targets);
      return r.ok ? { body: r } : { status: 400, body: r };
    }),
  );

  /** "That was everything": a closed day with planned meals unlogged counts as fully logged. */
  router.post(
    "/diet/days/:date/complete",
    route("diet-day-complete", async (ctx, req) => {
      const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.params.date);
      const r = await confirmDayComplete(ctx, date);
      return r.ok ? { body: r } : { status: 400, body: r };
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
      if (r.ok) {
        void recordManualPlan(ctx.userProfileId, "Your starting plan");
        void checkNewGoal(ctx.userProfileId);
      }
      return r.ok ? { body: r } : fromResult(r);
    }),
  );

  /** Everything Magnus holds about the person, as one JSON download. */
  router.get(
    "/account/export",
    route("account-export", async (ctx) => ({ body: await exportAccount(ctx.userProfileId) })),
  );

  /** Past meals from a MyFitnessPal export (the Nutrition Summary CSV). `dryRun` previews. */
  router.post(
    "/import/myfitnesspal",
    route("import-mfp", async (ctx, req) => {
      const r = await importMfp(ctx.userProfileId, mfpImportInput.parse(req.body), ctx.timezone);
      return r.ok ? { body: r } : { status: r.error === "not_mfp_summary" || r.error === "no_meals" || r.error === "too_many_rows" ? 400 : 500, body: r };
    }),
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

  /** Owner only: wipe all data and start again as a new user, keeping the Google sign-in. */
  router.post(
    "/account/reset",
    route("account-reset", async (ctx, req) => {
      z.object({ confirm: z.literal("RESET") }).parse(req.body ?? {});
      if (!(await isOwnerProfile(ctx.userProfileId))) return { status: 403, body: { ok: false, error: "owner_only" } };
      // As with deleting the account: a live paid plan is cancelled first, so it can't keep
      // billing a profile that no longer exists.
      const rzp = razorpayConfig();
      if (rzp) await cancelRazorpaySubscription(ctx.userProfileId, rzp).catch(() => undefined);
      const r = await resetOwnAccount(ctx.userProfileId);
      forgetEntitlement(ctx.userProfileId);
      return r.ok ? { body: r } : { status: r.error === "owner_only" ? 403 : r.error === "needs_google_sign_in" ? 400 : 500, body: r };
    }),
  );

  /** A personal token for a phone automation (Health Connect webhook). Shown once. */
  router.post(
    "/account/tokens",
    route("token-create", async (ctx, req) => {
      const { label, replace } = z
        .object({ label: z.string().trim().min(1).max(60).optional(), replace: z.boolean().optional() })
        .parse(req.body ?? {});
      // replace: a device reconnecting (the Android app) swaps its old token for the new one.
      const token = replace && label
        ? await replacePersonalToken(ctx.userProfileId, label)
        : await createPersonalToken(ctx.userProfileId, label);
      return { body: { ok: true, token } };
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
    route("chat-history", async (ctx, req) => {
      // One day per thread: today by default (opened with the day's plan), or ?date= for a past day.
      const today = localDateKey(new Date(), ctx.timezone);
      const date = isDateKey(req.query.date) && req.query.date <= today ? req.query.date : today;
      if (date === today) await tryDayPlan(ctx.userProfileId, ctx.timezone);
      const messages = await loadChatHistory(ctx.userProfileId, 200, localDayRange(date, ctx.timezone));
      // Every card shows its live state (logged, answered, applied), whatever phone it's opened on,
      // and a card whose day has closed shows how it ended instead of its buttons.
      const now = new Date();
      const at = (createdAt?: string) => cardAt(createdAt, ctx.timezone, now);
      const states = await loadCardStates(ctx.userProfileId, messages.flatMap((m) => m.cards), mealDaysOf(messages, at));
      for (const m of messages) m.cards = m.cards.map((c) => hydrateCard(c, states, at(m.createdAt)));
      return { body: { messages, date, today } };
    }),
  );

  /** Stop: the running turn ends at its next step and answers "Stopped." over its stream. */
  router.post(
    "/chat/stop",
    route("chat-stop", async (ctx, req) => {
      const { turnId } = z.object({ turnId: z.string().uuid() }).parse(req.body);
      return { body: { stopped: stopChatTurn(ctx.userProfileId, turnId) } };
    }),
  );

  /** The days before today that have chat, newest first, for the Past days screen. */
  router.get(
    "/chat/days",
    route("chat-days", async (ctx) => ({ body: { days: await listChatDays(ctx.userProfileId, ctx.timezone) } })),
  );

  router.post(
    "/chat",
    route("chat", async (ctx, req) => {
      const { text, turnId } = chatInput.parse(req.body);
      const allowed = await allowUse(ctx, "chat");
      if (allowed !== true) return { status: 429, body: { error: allowed } };
      const spend = await chatSpendMode(ctx);
      if (spend === "blocked") return { status: 429, body: { error: "spend_limit" } };
      const r = await runHealthChat(ctx, text, { turnId, sessionId: req.get("x-magnus-session") ?? undefined, fastOnly: spend === "fast_only" });
      if ("error" in r) return { status: 409, body: r };
      return { body: r };
    }),
  );

  /**
   * The same turn as POST /chat, streamed as server-sent events: `progress` lines while tools run,
   * `delta` text as the coach writes, then one `done` with the full reply (or `error`). A comment
   * line every few seconds keeps proxies and the phone from giving up on a long turn.
   */
  router.post("/chat/stream", async (req, res) => {
    const { userProfileId } = res.locals as Locals;
    let parsed: { text: string; turnId?: string };
    try {
      parsed = chatInput.parse(req.body);
    } catch (err) {
      res.status(400).json({ error: "invalid_body", issues: err instanceof z.ZodError ? err.issues : [] });
      return;
    }
    const ctx = { userProfileId, timezone: await cachedTimezone(userProfileId) };
    const allowed = await allowUse(ctx, "chat");
    if (allowed !== true) {
      res.status(429).json({ error: allowed });
      return;
    }
    const spend = await chatSpendMode(ctx);
    if (spend === "blocked") {
      res.status(429).json({ error: "spend_limit" });
      return;
    }
    res.status(200);
    res.setHeader("content-type", "text/event-stream; charset=utf-8");
    res.setHeader("cache-control", "no-cache, no-transform");
    res.setHeader("x-accel-buffering", "no");
    res.flushHeaders();
    const send = (event: ChatStreamEvent) => {
      if (!res.writableEnded) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(": keepalive\n\n");
    }, 5_000);
    try {
      const r = await runHealthChat(ctx, parsed.text, { turnId: parsed.turnId, sessionId: req.get("x-magnus-session") ?? undefined, onEvent: send, fastOnly: spend === "fast_only" });
      if ("error" in r) send({ type: "error", error: r.error, message: r.error === "busy" ? BUSY_MESSAGE : "Still working on that one. The answer will show here in a moment." });
      else send({ type: "done", reply: r });
    } catch (err) {
      const offline = isCoachOffline(err);
      if (offline) void alertOwnerCoachOffline();
      logger.error({ err: loggableError(err), route: "chat-stream", coachOffline: offline || undefined }, offline ? "model provider account unusable (credit or key)" : "health app route failed");
      res.locals.routeError = err instanceof Error ? err.message : String(err);
      if (offline) send({ type: "error", error: "coach_offline", message: COACH_OFFLINE_MESSAGE });
      else send({ type: "error", error: "server_error", message: "Something went wrong on my side. Tap Retry." });
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  });

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
    route("meal-draft", async (ctx, req) => {
      const input = mealDraftInput.parse(req.body);
      // Unseen foods are looked up with a paid web search, so drafts have a daily cap too.
      if ((await allowUse(ctx, "draft")) !== true) return { status: 429, body: { ok: false, error: "draft_limit" } };
      return { body: await startMealDraft(ctx, input) };
    }),
  );

  /** Photo of the plate → the same editable draft card, posted into the chat. */
  router.post(
    "/meals/photo",
    route("meal-photo", async (ctx, req) => {
      const input = photoMealInput.parse(req.body);
      // HEIC or oversized originals are converted first; a photo we can't open doesn't use up the day's allowance.
      const photo = await preparePhotoForVision(input.image);
      if (!photo.ok) return { status: 400, body: photo };
      const allowed = await allowUse(ctx, "photo");
      if (allowed !== true) return { status: 429, body: { ok: false, error: allowed } };
      const r = await draftMealFromPhoto(ctx, { ...input, image: photo.image, mediaType: photo.mediaType });
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

  /** "Same as yesterday": yesterday's meal at this slot, to log again; null when there was none. */
  router.get(
    "/meals/yesterday",
    route("meals-yesterday", async (ctx, req) => {
      const slot = z.enum(["breakfast", "lunch", "dinner", "snack"]).parse(req.query.slot);
      return { body: { meal: await yesterdaysMeal(ctx, slot) } };
    }),
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

  /** Picks from the food database for "log my own": ranked matches with their household servings and macros per serving. */
  router.get(
    "/foods/search",
    route("foods-search", async (ctx, req) => {
      const q = typeof req.query.q === "string" ? req.query.q.slice(0, 60) : "";
      const mine = await searchMyFoods(ctx.userProfileId, q);
      return { body: { foods: [...mine.map(myFoodPick), ...searchFoods(q, 20)].slice(0, 20) } };
    }),
  );

  /**
   * "Can't find it? Search": one food the database lacks, looked up on the web. Food names only
   * (checked before anything is paid for), same daily cap as meal estimates, cleaned results.
   * Nothing is logged here: the person approves it into their meal and confirms the meal.
   */
  router.post(
    "/foods/lookup",
    route("foods-lookup", async (ctx, req) => {
      const raw = typeof req.body?.text === "string" ? req.body.text : "";
      const q = checkFoodQuery(raw);
      if (!q.ok) return { status: 400, body: { ok: false, error: q.error } };
      if ((await allowUse(ctx, "draft")) !== true) return { status: 429, body: { ok: false, error: "draft_limit" } };
      const draft = await startMealDraft(ctx, { text: q.text }, { webFirst: true });
      const items = cleanLookupItems(draft.items);
      // Kept unapproved; "Add to my meal" saves them to their foods (POST /foods/mine). Food-table
      // answers (web lookups used up) are already in the searches, so there is nothing to keep.
      const lookupId = draft.source === "food_db" ? null : await recordLookup(ctx.userProfileId, items);
      return {
        body: {
          ok: true,
          text: q.text,
          source: draft.source,
          estimated: items.length > 0,
          lookupId,
          items,
          note: draft.servingAssumption ? draft.servingAssumption.slice(0, 400) : null,
        },
      };
    }),
  );

  /**
   * Saves foods the person approved so the searches offer them next time: a lookup's results by
   * its id (only what that lookup returned), or one food typed in from a label (name-checked).
   */
  router.post(
    "/foods/mine",
    route("foods-mine", async (ctx, req) => {
      const body = z
        .union([z.object({ lookupId: z.string().uuid() }), z.object({ item: z.object({ name: z.string().max(120), calories: z.number(), protein_g: z.number(), carbs_g: z.number(), fat_g: z.number() }) })])
        .parse(req.body);
      if ("lookupId" in body) return { body: { ok: true, saved: await approveLookup(ctx.userProfileId, body.lookupId) } };
      const saved = await saveOwnFood(ctx.userProfileId, body.item);
      return saved ? { body: { ok: true, saved: 1 } } : { status: 400, body: { ok: false, error: "not_a_food" } };
    }),
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
    route("meal-delete", async (ctx, req) => {
      const id = String(req.params.id);
      return fromResult(await removeMeal(ctx, id));
    }),
  );

  /** A logged meal's items, for editing it from its chat card. */
  router.get(
    "/meals/:id/items",
    route("meal-items", async (ctx, req) => {
      const r = await getLoggedMeal(ctx.userProfileId, String(req.params.id));
      return r.ok ? { body: r } : { status: r.error === "meal_not_found" ? 404 : 400, body: r };
    }),
  );

  /** Edit of a logged meal: the same log now holds these items. */
  router.put(
    "/meals/:id",
    route("meal-replace", async (ctx, req) => {
      const r = await replaceLoggedMeal(ctx, String(req.params.id), mealReplaceInput.parse(req.body));
      return r.ok ? { body: r } : { status: r.error === "meal_not_found" ? 404 : 400, body: r };
    }),
  );

  /** Undo / edit of something the coach logged straight from chat (weigh-in, steps, water, a removal). */
  router.post(
    "/chat/receipts/:id/undo",
    route("receipt-undo", async (ctx, req) => {
      const r = await undoReceipt(ctx, String(req.params.id));
      return r.ok ? { body: r } : { status: r.error === "not_found" ? 404 : 400, body: r };
    }),
  );
  router.post(
    "/chat/receipts/:id/edit",
    route("receipt-edit", async (ctx, req) => {
      const r = await editReceipt(ctx, String(req.params.id), receiptEditInput.parse(req.body ?? {}));
      return r.ok ? { body: r } : { status: r.error === "not_found" ? 404 : 400, body: r };
    }),
  );

  /** Steps ingest: manual entry and phone automations. */
  router.post(
    "/steps",
    route("steps", async (ctx, req) => fromResult(await logSteps(ctx, stepsInput.parse(req.body)))),
  );

  /** "Eating out tonight" from the quick-log sheet: a plan card in the chat, no model call. */
  router.post(
    "/plan/eating-out",
    route("plan-eating-out", async (ctx, req) => ({ body: await planEatingOut(ctx, eatingOutInput.parse(req.body ?? {}), { record: true }) })),
  );

  /** Water: add a glass (ml), or undo the day's latest. */
  router.post(
    "/water",
    route("water", async (ctx, req) => fromResult(await logWater(ctx, waterInput.parse(req.body)))),
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
    route("goal", async (ctx, req) => {
      const input = goalInput.parse(req.body);
      const before = await getActiveGoal(ctx.userProfileId).catch(() => null);
      const r = await setGoal(ctx, input);
      if (!r.ok) return fromResult(r);
      // New date or target: recompute the calorie target and meal plan, and say what moved.
      const replan = await replanForGoal(ctx, before, async (t) => (await setTargets(ctx, t)).ok);
      void recordManualPlan(ctx.userProfileId, "You set a new goal");
      void checkNewGoal(ctx.userProfileId);
      return fromResult({ ...r, replan });
    }),
  );

  router.post(
    "/goal/why",
    route("goal_why", async (ctx, req) => {
      const input = z.object({ why: z.string().trim().max(300) }).parse(req.body);
      const r = await saveGoalWhy(ctx.userProfileId, input.why);
      return fromResult(r.ok ? { ok: true as const, why: r.why } : r);
    }),
  );

  router.post(
    "/targets",
    route("targets", async (ctx, req) => {
      const r = await setTargets(ctx, targetsInput.parse(req.body));
      if (r.ok) void recordManualPlan(ctx.userProfileId, "You changed your targets");
      return fromResult(r);
    }),
  );

  /** Plan, trial and what can be bought. */
  router.get(
    "/billing",
    route("billing", async (ctx, req) => {
      const cfg = razorpayConfig();
      const now = new Date();
      const as = String(req.query.as ?? "");
      const ent =
        billingMode() === "preview" && (PREVIEW_STATES as readonly string[]).includes(as)
          ? previewEntitlement(as as (typeof PREVIEW_STATES)[number], now)
          : await loadEntitlement(ctx.userProfileId);
      return {
        body: {
          enabled: billingEnabled(),
          mode: billingMode(),
          entitlement: ent,
          experience: experienceFor(ent, now),
          prices: priceLabels(),
          amounts: priceAmounts(),
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
      const ent = await loadEntitlement(ctx.userProfileId);
      // During the trial, the first charge waits for the trial's end.
      const startAt = ent.tier === "trial" && ent.trialEndsAt ? new Date(ent.trialEndsAt) : null;
      const r = await createRazorpaySubscription(ctx.userProfileId, plan, cfg, fetch, new Date(), startAt);
      return { status: r.ok ? 200 : r.error === "already_subscribed" ? 409 : 502, body: r };
    }),
  );

  router.post(
    "/billing/razorpay/confirm",
    route("billing-confirm", async (ctx, req) => {
      const cfg = razorpayConfig();
      if (!cfg) return { status: 503, body: { ok: false, error: "billing_unavailable" } };
      const ent = await loadEntitlement(ctx.userProfileId);
      const startAt = ent.tier === "trial" && ent.trialEndsAt ? new Date(ent.trialEndsAt) : null;
      const r = await confirmRazorpayCheckout(ctx.userProfileId, confirmInput.parse(req.body), cfg, new Date(), startAt);
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

  /** The weekly routine: walks, gym, swims, sports, each with days, time, length and reminder. */
  router.get(
    "/routine",
    route("routine", async (ctx) => {
      const { routine } = await loadHealthProfile(ctx.userProfileId);
      if (routine === null) return { status: 503, body: { ok: false, error: "routine_unavailable" } };
      return { body: { ok: true, items: routine, lifting: liftingGap(routine) } };
    }),
  );

  router.put(
    "/routine",
    route("routine-save", async (ctx, req) => {
      const r = await setRoutine(ctx, routineInput.parse(req.body));
      if (r.ok) void recordManualPlan(ctx.userProfileId, "You changed your routine");
      return r.ok ? { body: r } : { status: r.error === "routine_unavailable" ? 503 : 400, body: r };
    }),
  );

  /** Answer to a routine follow-up: done (logs it), skipped (with why), or look again. */
  router.post(
    "/routine/check",
    route("routine-check", async (ctx, req) => {
      const r = await answerRoutineCheck(ctx, routineCheckAnswerInput.parse(req.body));
      return r.ok ? { body: r } : { status: r.error === "routine_item_not_found" ? 404 : 400, body: r };
    }),
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

  /** Coach memory: the lines the coach keeps about the person, editable on the You tab. */
  const memoryText = z.object({
    text: z.string().trim().min(1).max(MEMORY_MAX_CHARS),
    until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  });
  router.get(
    "/memory",
    route("memory", async (ctx) => {
      const today = memoryToday(ctx.timezone);
      const lines = await loadCoachMemory(ctx.userProfileId, today);
      // A line that is really a rule (diet, no gym) reaches chat only: the You tab marks it and offers
      // to apply it, unless the plan already holds that rule for the line's whole span (inPlanUntil).
      const spans = lines.some((l) => ruleKind(l.text)) ? await loadRuleSpans(ctx.userProfileId, today) : null;
      return {
        body: {
          ok: true,
          lines: lines.map((l) => ({ ...l, rule: ruleKind(l.text), inPlanUntil: spans ? inPlanUntil(l, spans, today) : null })),
          max: MEMORY_MAX_LINES,
        },
      };
    }),
  );
  router.post(
    "/memory",
    route("memory-add", async (ctx, req) => {
      const body = memoryText.parse(req.body);
      const r = await rememberLine(ctx.userProfileId, body.text, "person", { until: body.until, today: memoryToday(ctx.timezone) });
      return r.ok ? { body: r } : { status: 400, body: r };
    }),
  );
  router.put(
    "/memory/:id",
    route("memory-edit", async (ctx, req) => {
      const body = memoryText.parse(req.body);
      const r = await editLine(ctx.userProfileId, String(req.params.id), body.text, { until: body.until, today: memoryToday(ctx.timezone) });
      return r.ok ? { body: r } : { status: r.error === "not_found" ? 404 : 400, body: r };
    }),
  );
  router.delete(
    "/memory/:id",
    route("memory-forget", async (ctx, req) => {
      const r = await forgetLine(ctx.userProfileId, String(req.params.id), memoryToday(ctx.timezone));
      return r.ok ? { body: r } : { status: 404, body: r };
    }),
  );

  /** Plan-change cards: the person's answers, and the list of open ones. */
  const interventionAnswer = z.object({
    action: z.enum(["choose", "keep", "reason", "cancel", "confirm", "decline"]),
    optionId: z.string().max(40).optional(),
    reason: z.string().max(20).optional(),
  });
  router.get(
    "/interventions",
    route("interventions", async (ctx) => {
      const rows = await listInterventions(ctx.userProfileId, 60);
      return { body: { ok: true, interventions: rows.map(cardFromIntervention) } };
    }),
  );
  router.post(
    "/interventions/:id",
    route("intervention-respond", async (ctx, req) => {
      const body = interventionAnswer.parse(req.body);
      const r = await respondToIntervention(ctx, String(req.params.id), body.action, { optionId: body.optionId, reason: body.reason });
      return r.ok ? { body: r } : { status: r.error === "not_found" ? 404 : 409, body: r };
    }),
  );

  /** Plan history: every plan the person agreed to, and going back to one. */
  router.get(
    "/plan/versions",
    route("plan-versions", async (ctx) => ({ body: { ok: true, versions: await listVersions(ctx.userProfileId, 50) } })),
  );
  router.post(
    "/plan/versions/:id/revert",
    route("plan-revert", async (ctx, req) => {
      const r = await revertToVersion(ctx, String(req.params.id));
      return r.ok ? { body: r } : { status: r.error === "not_found" ? 404 : 400, body: r };
    }),
  );

  /** Root-cause analysis on demand, and the person's answer to its experiment. */
  router.post(
    "/rca",
    route("rca", async (ctx) => {
      if (!(await hasFeature(ctx.userProfileId, "rca"))) return { status: 402, body: { ok: false, error: "pro_feature" } };
      if ((await allowUse(ctx, "rca")) !== true) return { status: 429, body: { ok: false, error: "rca_limit" } };
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
      const body = { connected: true, analysis: analyzeTraining(h.workouts, now, ctx.timezone, TRAINING_ANALYSIS_WEEKS) };
      trainingCache.set(ctx.userProfileId, { at: Date.now(), body });
      return { body };
    }),
  );

  return router;
}

/** A saved food as a "Make your meal" pick: one serving with its own numbers. */
function myFoodPick(f: MyFood): FoodPick & { mine: boolean } {
  return {
    key: `mine:${f.id}`,
    name: f.name,
    diet: "",
    mine: f.mine,
    servings: [{ id: `mine:${f.id}`, label: "1 serving", grams: 0, default: true, kcal: f.calories, proteinG: f.protein_g, carbsG: f.carbs_g, fatG: f.fat_g, fiberG: 0 }],
  };
}

/** A saved food in the planned-meal editor: added as a custom item (edit.ts) with these numbers. */
function myFoodHit(f: MyFood) {
  const custom = { name: f.name, kcal: f.calories, proteinG: f.protein_g, carbsG: f.carbs_g, fatG: f.fat_g };
  return {
    key: `mine:${f.id}`,
    name: f.name,
    mine: f.mine,
    servings: [{
      id: `mine:${f.id}`,
      label: "1 serving",
      default: true,
      custom,
      item: { key: null, name: f.name, servingId: null, qty: 1, text: f.name, grams: null, kcal: f.calories, proteinG: f.protein_g, carbsG: f.carbs_g, fatG: f.fat_g, fiberG: 0 },
    }],
  };
}
