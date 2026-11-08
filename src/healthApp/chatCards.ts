/**
 * One contract for every card the coach shows in chat: where its live state lives, how the app
 * re-fetches it, and how a past turn describes it to the model. `GET /chat` and the model's
 * history both go through here, so a card can't be "unconfirmed" on one phone and "logged" on
 * another, and the coach can't mistake an answered check for an open one.
 */
import { supabase } from "../tools/clients.js";
import type { ChatCard } from "./chat.js";
import { cardFromRow, getProposals, type ProposalRow } from "./hevyProposals.js";
import { cardFromReport, getReports, type RcaReport } from "./rca.js";
import { checkKey, getRoutineChecks } from "./routineStore.js";
import type { RoutineCheck } from "./routine.js";
import { getWorkoutChecks } from "./workoutCheckStore.js";
import { cardFromIntervention, interventionNote } from "./interventions/card.js";
import { getInterventions } from "./interventions/store.js";
import type { Intervention } from "./interventions/types.js";
import { receiptLine } from "./logEdits.js";
import type { CardAt } from "./cardDay.js";

/** Where a logged meal sits in its day's plan (dayMeals.ts words): in place of a planned meal, or extra. */
export type MealPlanLink =
  | { role: "instead"; slot: string; insteadOf: string }
  | { role: "extra"; slot: string; canCount: boolean };

export type CardStates = {
  /** Meal draft id → calories logged under it (summed from meal_logs, deleted rows excluded). */
  mealsLogged: Map<string, { calories: number; plan?: MealPlanLink }>;
  /** Activity draft id → what was saved. */
  activitiesSaved: Map<string, { id: string; durationMin: number; kcal: number }>;
  /** Gym date → the current answer. */
  workoutChecks: Map<string, { status: string; reason: string | null }>;
  /** `${itemId}|${date}` → the current answer. */
  routineChecks: Map<string, RoutineCheck>;
  proposals: Map<string, ProposalRow>;
  reports: Map<string, RcaReport>;
  interventions: Map<string, Intervention>;
  /** `${date}|${slot}` → the planned meal's status (planned, logged, partial). */
  planMeals: Map<string, string>;
  /** `${date}|${slot}` → the meal log session an eaten planned meal wrote (for Edit). */
  planSessions: Map<string, string>;
  /** `${date}|${slot}` of planned meals replaced by food they logged themselves. */
  planOffPlan: Set<string>;
  /** Planned meals as they stand now (after an edit, swap or resize), by date|slot. */
  planMealNow: Map<string, { title: string; items: string[]; kcal: number; proteinG: number }>;
  /** Every planned meal's current title (eating out included), by date|slot. */
  planTitles: Map<string, string>;
  /** What was logged per `${date}|${slot}` from any source (chat card, Meals tab, barcode, plan). */
  slotLogs: Map<string, { calories: number; sessions: Set<string> }>;
};

/** A card's day is over: its buttons freeze and this line says how it ended (from the logs). */
export type ShownCard = ChatCard & { closed?: true; closedLabel?: string };

export function emptyCardStates(): CardStates {
  return { mealsLogged: new Map(), activitiesSaved: new Map(), workoutChecks: new Map(), routineChecks: new Map(), proposals: new Map(), reports: new Map(), interventions: new Map(), planMeals: new Map(), planSessions: new Map(), planOffPlan: new Set(), planMealNow: new Map(), planTitles: new Map(), slotLogs: new Map() };
}

/**
 * Loads the live state behind every card in `cards`, in as few queries as the mix needs.
 * `mealDays`: the days of meal cards never confirmed, so they can say what that slot holds now
 * (lunch logged from the Meals tab instead, say) rather than "not logged".
 */
export async function loadCardStates(userProfileId: string, cards: ChatCard[], mealDays: string[] = []): Promise<CardStates> {
  const states = emptyCardStates();
  const mealIds: string[] = [];
  const activityIds: string[] = [];
  const workoutDates: string[] = [];
  const routineDates: string[] = [];
  const proposalIds: string[] = [];
  const reportIds: string[] = [];
  const interventionIds: string[] = [];
  const planDates: string[] = [];
  for (const c of cards) {
    if (c.type === "meal_draft") mealIds.push(c.draft.draftId);
    else if (c.type === "activity_draft") activityIds.push(c.draft.draftId);
    else if (c.type === "workout_check") workoutDates.push(c.date);
    else if (c.type === "routine_check") routineDates.push(c.date);
    else if (c.type === "hevy_proposal") proposalIds.push(c.proposalId);
    else if (c.type === "rca") reportIds.push(c.reportId);
    else if (c.type === "intervention") interventionIds.push(c.interventionId);
    else if (c.type === "plan_meal") planDates.push(c.date);
    else if (c.type === "plan_adjust" && c.next) planDates.push(c.next.date);
  }
  const range = (dates: string[]) => {
    const s = [...dates].sort();
    return [s[0]!, s[s.length - 1]!] as const;
  };

  const days = [...new Set(mealDays)];
  const [meals, activities, workouts, routines, proposals, reports, interventions, planMeals, slotLogs] = await Promise.all([
    mealIds.length
      ? supabase.from("meal_logs").select("meal_session_id, calories, local_date, meal_slot").eq("user_profile_id", userProfileId).in("meal_session_id", mealIds).is("deleted_at", null)
      : Promise.resolve({ data: [] }),
    activityIds.length
      ? supabase.from("health_activities").select("id, draft_id, duration_min, kcal").eq("user_profile_id", userProfileId).in("draft_id", activityIds).is("deleted_at", null)
      : Promise.resolve({ data: [] }),
    workoutDates.length ? getWorkoutChecks(userProfileId, ...range(workoutDates)) : Promise.resolve(new Map()),
    routineDates.length ? getRoutineChecks(userProfileId, ...range(routineDates)) : Promise.resolve(new Map<string, RoutineCheck>()),
    getProposals(userProfileId, proposalIds),
    getReports(userProfileId, reportIds),
    getInterventions(userProfileId, interventionIds),
    planDates.length
      ? supabase.from("meal_plan_entries").select("local_date, meal_slot, status, title, metadata").eq("user_profile_id", userProfileId).eq("source", "plan").in("local_date", [...new Set(planDates)]).in("status", ["planned", "logged", "partial"])
      : Promise.resolve({ data: [] }),
    days.length
      ? supabase.from("meal_logs").select("meal_session_id, calories, local_date, meal_slot").eq("user_profile_id", userProfileId).in("local_date", days).is("deleted_at", null)
      : Promise.resolve({ data: [] }),
  ]);

  for (const r of (slotLogs.data ?? []) as Array<{ meal_session_id: string | null; calories: number | null; local_date: string; meal_slot: string | null }>) {
    const key = `${r.local_date}|${r.meal_slot ?? "snack"}`;
    const cur = states.slotLogs.get(key) ?? { calories: 0, sessions: new Set<string>() };
    cur.calories += Number(r.calories) || 0;
    if (r.meal_session_id) cur.sessions.add(r.meal_session_id);
    states.slotLogs.set(key, cur);
  }

  const mealRows = (meals.data ?? []) as Array<{ meal_session_id: string; calories: number | null; local_date?: string | null; meal_slot?: string | null }>;
  for (const r of mealRows) {
    const cur = states.mealsLogged.get(r.meal_session_id) ?? { calories: 0 };
    cur.calories += Number(r.calories) || 0;
    states.mealsLogged.set(r.meal_session_id, cur);
  }
  await addPlanLinks(userProfileId, mealRows, states).catch(() => {});
  for (const r of (activities.data ?? []) as Array<{ id: string; draft_id: string; duration_min: number | null; kcal: number | null }>) {
    states.activitiesSaved.set(r.draft_id, { id: r.id, durationMin: Number(r.duration_min) || 0, kcal: Number(r.kcal) || 0 });
  }
  for (const [date, c] of workouts as Map<string, { status: string; reason: string | null }>) states.workoutChecks.set(date, { status: c.status, reason: c.reason ?? null });
  states.routineChecks = routines;
  states.proposals = proposals;
  states.reports = reports;
  states.interventions = interventions;
  for (const r of (planMeals.data ?? []) as Array<{ local_date: string; meal_slot: string; status: string; title?: string; metadata?: Record<string, unknown> | null }>) {
    states.planMeals.set(`${r.local_date}|${r.meal_slot}`, r.status);
    if (r.metadata?.off_plan === true && r.metadata?.kind !== "eat_out") states.planOffPlan.add(`${r.local_date}|${r.meal_slot}`);
    if (typeof r.metadata?.logged_session_id === "string") states.planSessions.set(`${r.local_date}|${r.meal_slot}`, r.metadata.logged_session_id);
    if (r.title) states.planTitles.set(`${r.local_date}|${r.meal_slot}`, r.title);
    const items = (r.metadata?.eaten_items ?? r.metadata?.items) as Array<{ text: string; kcal: number; proteinG: number }> | undefined;
    if (items?.length && r.metadata?.kind !== "eat_out") {
      states.planMealNow.set(`${r.local_date}|${r.meal_slot}`, {
        title: r.title ?? "",
        items: items.map((i) => i.text),
        kcal: Math.round(items.reduce((a, i) => a + (i.kcal || 0), 0)),
        proteinG: Math.round(items.reduce((a, i) => a + (i.proteinG || 0), 0)),
      });
    }
  }
  return states;
}

/**
 * For each logged meal card: did it take a planned meal's place, or is it extra? (Same rule as the
 * day list.) Only on days with a meal plan; without one a meal is just logged.
 */
async function addPlanLinks(userProfileId: string, rows: Array<{ meal_session_id: string; local_date?: string | null; meal_slot?: string | null }>, states: CardStates): Promise<void> {
  const first = new Map<string, { date: string; slot: string }>();
  for (const r of rows) if (r.local_date && !first.has(r.meal_session_id)) first.set(r.meal_session_id, { date: r.local_date, slot: r.meal_slot ?? "snack" });
  const dates = [...new Set([...first.values()].map((x) => x.date))];
  if (!dates.length) return;
  const { data, error } = await supabase
    .from("meal_plan_entries")
    .select("local_date, meal_slot, status, title, metadata")
    .eq("user_profile_id", userProfileId)
    .eq("source", "plan")
    .in("local_date", dates)
    .in("status", ["planned", "logged", "partial"]);
  if (error) return;
  const entries = (data ?? []) as Array<{ local_date: string; meal_slot: string; status: string; title: string; metadata: Record<string, unknown> | null }>;
  for (const [session, at] of first) {
    const cur = states.mealsLogged.get(session);
    if (!cur) continue;
    const day = entries.filter((e) => e.local_date === at.date);
    if (!day.length) continue;
    const linked = day.find((e) => e.metadata?.logged_session_id === session);
    if (linked) {
      const items = (linked.metadata?.items as Array<{ text?: string }> | undefined) ?? [];
      const planned = linked.metadata?.kind === "eat_out" ? linked.title : items.map((i) => i.text).filter(Boolean).join(", ") || linked.title;
      cur.plan = { role: "instead", slot: linked.meal_slot, insteadOf: planned };
      continue;
    }
    const slotEntry = day.find((e) => e.meal_slot === at.slot);
    cur.plan = { role: "extra", slot: at.slot, canCount: !!slotEntry && slotEntry.status === "planned" && slotEntry.metadata?.kind !== "eat_out" };
  }
}

const slotWord = (slot: string): string => slot.charAt(0).toUpperCase() + slot.slice(1);

/** The day a meal card belongs to: its own (a planned meal on another day), else the day it was posted. */
function mealDayOf(card: Extract<ChatCard, { type: "meal_draft" }>, at?: CardAt): string | undefined {
  return card.draft.date ?? at?.date;
}

/** What else is logged in an unconfirmed meal card's slot that day. */
function slotLoggedFor(card: Extract<ChatCard, { type: "meal_draft" }>, states: CardStates, at?: CardAt): { calories: number } | null {
  if (card.saved) return null;
  const day = mealDayOf(card, at);
  if (!day) return null;
  const other = states.slotLogs.get(`${day}|${card.draft.slot}`);
  return other && other.calories > 0 ? { calories: Math.round(other.calories) } : null;
}

/** The days of the meal cards in these messages, for `loadCardStates`' slot lookup. */
export function mealDaysOf(rows: Array<{ cards?: ChatCard[]; createdAt?: string }>, at: (createdAt?: string) => CardAt | undefined): string[] {
  const out = new Set<string>();
  for (const r of rows) {
    for (const c of r.cards ?? []) {
      if (c.type !== "meal_draft") continue;
      const d = mealDayOf(c, at(r.createdAt));
      if (d) out.add(d);
    }
  }
  return [...out];
}

/**
 * How an unanswered card ended once its day closed, or null when it needs no closing (answered,
 * informational, or a trial that runs over several days). Read from the live state, never stored,
 * so a meal logged later from Past days still changes what it says.
 */
export function closedLabel(live: ChatCard, states: CardStates, at: CardAt): string | null {
  switch (live.type) {
    case "meal_draft": {
      if (live.saved) return null;
      const other = slotLoggedFor(live, states, at);
      return other ? `Not logged from this card · ${slotWord(live.draft.slot)} logged separately (${other.calories} kcal)` : "Not logged";
    }
    case "activity_draft":
      return live.saved ? null : "Not saved";
    case "workout_check":
    case "routine_check":
      return live.status === "missing" ? "Not logged" : null;
    case "hevy_proposal":
      return live.status === "pending" || live.status === "failed" ? "Expired, not applied in Hevy" : null;
    case "rca":
      return live.status === "proposed" ? "Closed without an answer" : null;
    case "intervention":
      return live.status === "offered" ? "Closed for this day. If it still applies, it's in today's plan." : null;
    case "calorie_review":
      return "Closed. A new review comes when it's due.";
    case "plan_meal":
      return live.status === "logged" || live.status === "partial" ? null : "Not logged";
    default:
      return null;
  }
}

/**
 * The card as the app should render it: live state folded in and, once its day has closed, frozen
 * with how it ended. A meal card also carries its day, so confirming it later logs to that day.
 */
export function hydrateCard(card: ChatCard, states: CardStates, at?: CardAt): ShownCard {
  let live: ShownCard = liveCard(card, states);
  if (live.type === "meal_draft" && !live.draft.date && at) live = { ...live, draft: { ...live.draft, date: at.date } };
  if (!at?.closed) return live;
  const label = closedLabel(live, states, at);
  return label ? { ...live, closed: true, closedLabel: label } : live;
}

function liveCard(card: ChatCard, states: CardStates): ChatCard {
  switch (card.type) {
    case "meal_draft": {
      const logged = states.mealsLogged.get(card.draft.draftId);
      return logged ? { ...card, saved: { calories: logged.calories, ...(logged.plan ? { plan: logged.plan } : {}) } } : card;
    }
    case "activity_draft": {
      const saved = states.activitiesSaved.get(card.draft.draftId);
      return saved ? { ...card, saved } : card;
    }
    case "workout_check": {
      const cur = states.workoutChecks.get(card.date);
      return cur ? { ...card, status: cur.status as typeof card.status, reason: cur.reason } : card;
    }
    case "routine_check": {
      const cur = states.routineChecks.get(checkKey(card.itemId, card.date));
      return cur ? { ...card, status: cur.status, reason: cur.reason } : card;
    }
    case "hevy_proposal": {
      const row = states.proposals.get(card.proposalId);
      return row ? cardFromRow(row) : card;
    }
    case "rca": {
      const r = states.reports.get(card.reportId);
      return r ? cardFromReport(r) : card;
    }
    case "intervention": {
      const i = states.interventions.get(card.interventionId);
      return i ? cardFromIntervention(i) : card;
    }
    case "plan_meal": {
      const key = `${card.date}|${card.slot}`;
      const status = states.planMeals.get(key);
      // The card shows the meal as it is now, so an edit or swap made later shows up here too.
      const now = states.planMealNow.get(key);
      const session = states.planSessions.get(key);
      return { ...card, ...(now ?? {}), ...(status ? { status } : {}), ...(session ? { loggedSessionId: session } : {}), ...(states.planOffPlan.has(key) ? { offPlan: true } : {}) };
    }
    case "plan_adjust": {
      // Tomorrow's meals as they stand now: a plan rebuilt after the card was posted (a new food
      // rule, a swap) must not keep showing the old dishes.
      if (!card.next) return card;
      const date = card.next.date;
      const meals = card.next.meals.map((m) => {
        const key = `${date}|${m.slot}`;
        const now = states.planMealNow.get(key);
        const title = states.planTitles.get(key);
        const status = states.planMeals.get(key);
        return { ...m, ...(title ? { title } : {}), ...(now ? { kcal: now.kcal } : {}), ...(status ? { status } : {}) };
      });
      return { ...card, next: { ...card.next, meals } };
    }
    default:
      return card;
  }
}

const CHECK_STATE: Record<string, string> = {
  missing: "not answered yet",
  done: "answered: done",
  found: "resolved: workout found in Hevy",
  skipped: "answered: skipped",
  trained_unlogged: "answered: trained but didn't log it",
};

/** One line per card, so later turns know what was shown and whether it was acted on. */
export function cardHistoryNote(card: ChatCard, states: CardStates, at?: CardAt): string {
  const note = historyNote(card, states, at);
  if (!note || !at?.closed || !closedLabel(liveCard(card, states), states, at)) return note;
  return `${note.slice(0, -1)}; its day is closed, so it can't be answered: don't ask about it]`;
}

function historyNote(card: ChatCard, states: CardStates, at?: CardAt): string {
  const live = liveCard(card, states);
  switch (live.type) {
    case "meal_draft": {
      const d = live.draft;
      const other = slotLoggedFor(live, states, at);
      const state = live.saved
        ? `logged, ${live.saved.calories} kcal`
        : other
          ? `never confirmed from this card; ${d.slot} on ${mealDayOf(live, at)} was logged separately (${other.calories} kcal), so don't call that meal missing`
          : "never confirmed, not logged";
      return `[Meal card "${d.text.slice(0, 80)}", about ${d.totals.calories} kcal: ${state}]`;
    }
    case "activity_draft": {
      const d = live.draft;
      const state = live.saved ? `saved, ${live.saved.durationMin} min, ${live.saved.kcal} kcal` : "never saved";
      return `[Activity card ${d.label}, ${d.durationMin} min, about ${d.kcal} kcal: ${state}]`;
    }
    case "workout_check": {
      const state = CHECK_STATE[live.status] ?? live.status;
      return `[Gym check for ${live.date} (slot ${live.gymTime}): ${state}${live.reason ? `, reason: ${live.reason}` : ""}]`;
    }
    case "routine_check": {
      const state = CHECK_STATE[live.status] ?? live.status;
      return `[Routine check for ${live.label} on ${live.date}: ${state}${live.reason ? `, reason: ${live.reason}` : ""}]`;
    }
    case "hevy_proposal":
      return `[Hevy change card "${live.title}": ${live.status === "applied" ? "applied in Hevy" : live.status === "discarded" ? "discarded" : live.status === "failed" ? "failed to apply" : "not applied yet"}]`;
    case "rca":
      return `[Root-cause card, experiment "${live.experiment.slice(0, 80)}": ${live.status === "proposed" ? "no answer yet" : live.status}]`;
    case "intervention":
      return interventionNote(live);
    case "day_plan":
      // The plan's text is the message itself; nothing to add.
      return "";
    case "eating_out":
      return `[Eating-out plan for ${live.meal}: ${live.reserveKcal != null ? `keep ${live.reserveKcal} kcal for it, ${live.beforeKcal} kcal before it` : "no calorie target, rules only"}]`;
    case "plan_meal":
      return `[Planned ${live.slot} card for ${live.date}, ${live.title}: ${live.status === "logged" || live.status === "partial" ? "eaten" : "not eaten yet"}]`;
    case "plan_adjust":
      return `[${live.kind === "day_close" ? "Day close" : "Rest-of-day rebalance"} card: ${live.headline}]`;
    case "log_receipt": {
      const state = live.state === "undone" ? "undone by the person, no longer logged" : live.state === "edited" ? "changed by the person to this" : "logged";
      return `[Logged from chat for ${live.date}: ${receiptLine(live)}: ${state}]`;
    }
    case "calorie_review":
      return `[Calorie target card: suggests ${live.review.suggestedTarget} kcal (current ${live.review.currentTarget ?? "unset"}); the person applies it from the card]`;
    default:
      return "[Card]";
  }
}
