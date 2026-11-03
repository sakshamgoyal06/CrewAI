/**
 * Tool results for evals: the shapes the real tools return, with fixed numbers, and a record of
 * every call so a case can check what the model did. Nothing is written anywhere.
 */
import type { ChatCard, ToolOutcome } from "../chat.js";
import { statusForModel } from "../chat.js";
import type { HealthSnapshot } from "../snapshot.js";

export type ToolCall = { name: string; input: Record<string, unknown> };

export function stubTools(snapshot: HealthSnapshot | null, options: { failing?: Set<string> } = {}) {
  const calls: ToolCall[] = [];
  const tool = async (name: string, rawInput: unknown): Promise<ToolOutcome> => {
    const input = (rawInput ?? {}) as Record<string, unknown>;
    calls.push({ name, input });
    if (options.failing?.has(name)) throw new Error(`fetch failed: ${name} (eval failure injection)`);
    switch (name) {
      case "get_status":
        return { result: snapshot ? statusForModel(snapshot) : { ok: false, error: "no_data" } };
      case "draft_meal": {
        const text = String(input.text ?? "");
        const card: ChatCard = {
          type: "meal_draft",
          draft: {
            draftId: `eval-meal-${calls.length}`,
            text,
            slot: (input.slot as never) ?? "unspecified",
            source: "food_db",
            items: [{ name: text, calories: 520, protein_g: 22, carbs_g: 70, fat_g: 14 }],
            totals: { calories: 520, protein_g: 22, carbs_g: 70, fat_g: 14 },
            estimated: true,
            servingAssumption: null,
          } as never,
        };
        return { result: { shownToUserAsCard: true, estimated: true, totals: card.draft.totals, items: card.draft.items, slot: card.draft.slot, source: "food_db" }, card };
      }
      case "draft_activity": {
        const durationMin = Number(input.durationMin) || 30;
        const label = String(input.activity ?? "Activity");
        const card: ChatCard = {
          type: "activity_draft",
          draft: {
            draftId: `eval-act-${calls.length}`,
            date: String(input.date ?? "2026-11-03"),
            startTime: null,
            durationMin,
            key: label.toLowerCase(),
            label,
            intensity: (input.intensity as never) ?? "moderate",
            distanceM: input.distanceKm ? Number(input.distanceKm) * 1000 : null,
            kcal: input.kcal ? Number(input.kcal) : Math.round(durationMin * 8),
            kcalSource: input.kcal ? "user" : "estimate",
            met: 8,
            weightKg: 81.9,
            duplicateOf: null,
            training: { countsAsTraining: false, note: null } as never,
            source: "chat",
          } as never,
        };
        return { result: { shownToUserAsCard: true, label, kcal: card.draft.kcal, countsAsTraining: false }, card };
      }
      case "log_steps":
        return { result: { ok: true, date: String(input.date ?? "2026-11-03"), steps: input.steps }, changed: true };
      case "log_body_checkin":
        return { result: { ok: true, date: String(input.date ?? "2026-11-03"), ...input }, changed: true };
      case "set_goal":
      case "set_daily_targets":
      case "answer_routine_check":
      case "answer_workout_check":
      case "delete_meal":
      case "delete_activity":
        return { result: { ok: true, ...input }, changed: true };
      case "remember":
        return { result: { ok: true, remembered: String(input.text ?? ""), alreadyKnown: false, lines: 1 } };
      case "respond_to_intervention":
        return { result: { ok: true, status: input.action === "choose" ? "trial" : input.action === "keep" ? "kept" : "ok", message: "Done." }, changed: true };
      case "forget":
        return { result: { ok: true, forgot: String(input.text ?? ""), lines: 0 } };
      case "set_daily_routine":
        return { result: { ok: true, items: input.items, trainingDays: [1, 3, 5], lifting: { short: false, need: 3 } }, changed: true };
      case "get_training_analysis":
        return {
          result: {
            weeks: 8,
            workoutsPerWeek: 2.4,
            exercises: [
              { name: "Bench Press (Barbell)", trend: "stalled", weeksStalled: 4, lastTopSet: { weightKg: 70, reps: 6 }, latestE1rm: 81 },
              { name: "Squat (Barbell)", trend: "progressing", lastTopSet: { weightKg: 100, reps: 5 }, latestE1rm: 112 },
            ],
          },
        };
      case "get_routines":
        return { result: { routines: [{ id: "r1", title: "Push day", exercises: [{ exerciseTemplateId: "bench", name: "Bench Press (Barbell)", sets: 3, restSeconds: 120 }] }] } };
      case "search_exercises":
        return { result: { matches: [{ id: "incline-db", name: "Incline Bench Press (Dumbbell)" }, { id: "db-press", name: "Bench Press (Dumbbell)" }] } };
      case "propose_routine_change":
      case "propose_new_routine":
      case "propose_workout_log": {
        const proposalId = `eval-p-${calls.length}`;
        const card = { type: "hevy_proposal", proposalId, kind: "routine_change", title: "Push day", reason: null, lines: [{ kind: "change", text: "Bench Press: 3x6 → 3x8-10" }], status: "pending" } as unknown as ChatCard;
        return { result: { shownToUserAsCard: true, proposalId, summary: ["Bench Press: 3x6 → 3x8-10"] }, card };
      }
      case "root_cause_analysis": {
        const rca = { hypothesis: "Protein falls short on days without a planned dinner.", experiment: "Add a dal or sprouts bowl to every dinner for 7 days.", evidence: ["Protein missed on 4 of 7 days", "Dinner logged late on 3 of those"] };
        const card = { type: "rca", reportId: "eval-rca", ...rca, status: "proposed" } as unknown as ChatCard;
        return { result: { shownToUserAsCard: true, ...rca }, card };
      }
      case "review_calorie_target":
        return {
          result: { status: "ok", maintenanceKcal: 2350, avgIntakeKcal: 1780, loggedDays: 18, weighIns: 3, trendWeightKg: 81.9, actualKgPerWeek: -0.55, neededKgPerWeek: -0.62, plannedKgPerWeek: -0.6, suggestedTarget: 1750, currentTarget: 1800, change: -50, recommend: false, confidence: "medium", cappedForSafety: false, safeDate: null, targetWeightKg: 74, deadline: "2027-01-31", summary: "On pace; keep 1800." },
        };
      default:
        return { result: { ok: false, error: `unknown tool ${name}` } };
    }
  };
  return { tool, calls };
}
