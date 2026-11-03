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

export type CardStates = {
  /** Meal draft id → calories logged under it (summed from meal_logs, deleted rows excluded). */
  mealsLogged: Map<string, { calories: number }>;
  /** Activity draft id → what was saved. */
  activitiesSaved: Map<string, { durationMin: number; kcal: number }>;
  /** Gym date → the current answer. */
  workoutChecks: Map<string, { status: string; reason: string | null }>;
  /** `${itemId}|${date}` → the current answer. */
  routineChecks: Map<string, RoutineCheck>;
  proposals: Map<string, ProposalRow>;
  reports: Map<string, RcaReport>;
  interventions: Map<string, Intervention>;
};

export function emptyCardStates(): CardStates {
  return { mealsLogged: new Map(), activitiesSaved: new Map(), workoutChecks: new Map(), routineChecks: new Map(), proposals: new Map(), reports: new Map(), interventions: new Map() };
}

/** Loads the live state behind every card in `cards`, in as few queries as the mix needs. */
export async function loadCardStates(userProfileId: string, cards: ChatCard[]): Promise<CardStates> {
  const states = emptyCardStates();
  const mealIds: string[] = [];
  const activityIds: string[] = [];
  const workoutDates: string[] = [];
  const routineDates: string[] = [];
  const proposalIds: string[] = [];
  const reportIds: string[] = [];
  const interventionIds: string[] = [];
  for (const c of cards) {
    if (c.type === "meal_draft") mealIds.push(c.draft.draftId);
    else if (c.type === "activity_draft") activityIds.push(c.draft.draftId);
    else if (c.type === "workout_check") workoutDates.push(c.date);
    else if (c.type === "routine_check") routineDates.push(c.date);
    else if (c.type === "hevy_proposal") proposalIds.push(c.proposalId);
    else if (c.type === "rca") reportIds.push(c.reportId);
    else if (c.type === "intervention") interventionIds.push(c.interventionId);
  }
  const range = (dates: string[]) => {
    const s = [...dates].sort();
    return [s[0]!, s[s.length - 1]!] as const;
  };

  const [meals, activities, workouts, routines, proposals, reports, interventions] = await Promise.all([
    mealIds.length
      ? supabase.from("meal_logs").select("meal_session_id, calories").eq("user_profile_id", userProfileId).in("meal_session_id", mealIds).is("deleted_at", null)
      : Promise.resolve({ data: [] }),
    activityIds.length
      ? supabase.from("health_activities").select("draft_id, duration_min, kcal").eq("user_profile_id", userProfileId).in("draft_id", activityIds).is("deleted_at", null)
      : Promise.resolve({ data: [] }),
    workoutDates.length ? getWorkoutChecks(userProfileId, ...range(workoutDates)) : Promise.resolve(new Map()),
    routineDates.length ? getRoutineChecks(userProfileId, ...range(routineDates)) : Promise.resolve(new Map<string, RoutineCheck>()),
    getProposals(userProfileId, proposalIds),
    getReports(userProfileId, reportIds),
    getInterventions(userProfileId, interventionIds),
  ]);

  for (const r of (meals.data ?? []) as Array<{ meal_session_id: string; calories: number | null }>) {
    const cur = states.mealsLogged.get(r.meal_session_id) ?? { calories: 0 };
    cur.calories += Number(r.calories) || 0;
    states.mealsLogged.set(r.meal_session_id, cur);
  }
  for (const r of (activities.data ?? []) as Array<{ draft_id: string; duration_min: number | null; kcal: number | null }>) {
    states.activitiesSaved.set(r.draft_id, { durationMin: Number(r.duration_min) || 0, kcal: Number(r.kcal) || 0 });
  }
  for (const [date, c] of workouts as Map<string, { status: string; reason: string | null }>) states.workoutChecks.set(date, { status: c.status, reason: c.reason ?? null });
  states.routineChecks = routines;
  states.proposals = proposals;
  states.reports = reports;
  states.interventions = interventions;
  return states;
}

/** The card with its live state folded in, as the app should render it. */
export function hydrateCard(card: ChatCard, states: CardStates): ChatCard {
  switch (card.type) {
    case "meal_draft": {
      const logged = states.mealsLogged.get(card.draft.draftId);
      return logged ? { ...card, saved: { calories: logged.calories } } : card;
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
export function cardHistoryNote(card: ChatCard, states: CardStates): string {
  const live = hydrateCard(card, states);
  switch (live.type) {
    case "meal_draft": {
      const d = live.draft;
      const state = live.saved ? `logged, ${live.saved.calories} kcal` : "never confirmed, not logged";
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
    case "calorie_review":
      return `[Calorie target card: suggests ${live.review.suggestedTarget} kcal (current ${live.review.currentTarget ?? "unset"}); the person applies it from the card]`;
    default:
      return "[Card]";
  }
}
