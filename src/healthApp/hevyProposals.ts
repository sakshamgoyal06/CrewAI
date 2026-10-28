/**
 * Hevy writes from the coach: routine edits, new routines and workout logs. The coach only ever
 * creates a proposal (shown as a card); the exact stored payload is sent to Hevy when the person
 * applies it. Routine edits are applied as operations on the current routine, so exercises the
 * coach didn't mention are kept as they are.
 */
import { z } from "zod";

import { localDateKey } from "../nutrition/localDate.js";
import {
  createHevyRoutine,
  createHevyWorkout,
  updateHevyRoutine,
  type HevyExerciseTemplateBrief,
  type HevyPostRoutineBody,
  type HevyPostWorkoutBody,
  type HevyRoutine,
  type HevyRoutineExerciseInput,
  type HevyRoutineSetInput,
  type HevyWorkoutSetInput,
} from "../pillars/health/workouts/hevy/index.js";
import { supabase } from "../tools/clients.js";
import type { ActionContext } from "./actions.js";
import { describeSets, exerciseCatalog, hevyKey, loadRoutines } from "./training.js";
import { getWorkoutChecks, saveWorkoutCheckAnswer } from "./workoutCheckStore.js";

// ---------- inputs ----------

const setInput = z.object({
  type: z.enum(["warmup", "normal", "failure", "dropset"]).optional(),
  weightKg: z.coerce.number().min(0).max(600).optional(),
  reps: z.coerce.number().int().min(0).max(200).optional(),
  repRange: z.object({ start: z.coerce.number().int().min(1).max(100), end: z.coerce.number().int().min(1).max(100) }).optional(),
  durationSeconds: z.coerce.number().int().min(0).max(36_000).optional(),
  distanceMeters: z.coerce.number().int().min(0).max(200_000).optional(),
  rpe: z.union([z.literal(6), z.literal(7), z.literal(7.5), z.literal(8), z.literal(8.5), z.literal(9), z.literal(9.5), z.literal(10)]).optional(),
});

const exerciseInput = z.object({
  exerciseTemplateId: z.string().trim().min(1),
  sets: z.array(setInput).min(1).max(15),
  restSeconds: z.coerce.number().int().min(0).max(900).optional(),
  notes: z.string().max(500).optional(),
  supersetId: z.coerce.number().int().min(0).optional(),
});

const changeInput = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("replace"),
    exerciseTemplateId: z.string().min(1),
    newExerciseTemplateId: z.string().min(1),
    sets: z.array(setInput).min(1).max(15).optional(),
    notes: z.string().max(500).optional(),
  }),
  z.object({ op: z.literal("add"), exercise: exerciseInput, afterExerciseTemplateId: z.string().optional() }),
  z.object({ op: z.literal("remove"), exerciseTemplateId: z.string().min(1) }),
  z.object({
    op: z.literal("update"),
    exerciseTemplateId: z.string().min(1),
    sets: z.array(setInput).min(1).max(15).optional(),
    restSeconds: z.coerce.number().int().min(0).max(900).optional(),
    notes: z.string().max(500).optional(),
  }),
]);

export const routineChangeInput = z.object({
  routineId: z.string().trim().min(1),
  reason: z.string().trim().min(1).max(500),
  title: z.string().trim().min(1).max(120).optional(),
  changes: z.array(changeInput).min(1).max(15),
});

export const newRoutineInput = z.object({
  title: z.string().trim().min(1).max(120),
  reason: z.string().trim().max(500).optional(),
  notes: z.string().max(1000).optional(),
  exercises: z.array(exerciseInput).min(1).max(20),
});

export const workoutLogInput = z.object({
  title: z.string().trim().min(1).max(120),
  startTime: z.string().datetime({ offset: true }),
  durationMin: z.coerce.number().int().min(5).max(300),
  description: z.string().max(1000).optional(),
  exercises: z.array(exerciseInput).min(1).max(30),
});

type SetIn = z.infer<typeof setInput>;
type ExerciseIn = z.infer<typeof exerciseInput>;
type ChangeIn = z.infer<typeof changeInput>;

export type ProposalKind = "routine_update" | "routine_create" | "workout_log";
export type ProposalStatus = "pending" | "applying" | "applied" | "discarded" | "failed";
export type SummaryLine = { kind: "add" | "remove" | "change" | "keep" | "info"; text: string };

export type HevyProposalCard = {
  type: "hevy_proposal";
  proposalId: string;
  kind: ProposalKind;
  title: string;
  reason: string | null;
  lines: SummaryLine[];
  status: ProposalStatus;
  error?: string | null;
};

// ---------- pure builders ----------

function routineSet(s: SetIn): HevyRoutineSetInput {
  return {
    type: s.type ?? "normal",
    weight_kg: s.weightKg ?? null,
    reps: s.repRange ? null : (s.reps ?? null),
    duration_seconds: s.durationSeconds ?? null,
    distance_meters: s.distanceMeters ?? null,
    rep_range: s.repRange ? { start: Math.min(s.repRange.start, s.repRange.end), end: Math.max(s.repRange.start, s.repRange.end) } : null,
  };
}

function workoutSet(s: SetIn): HevyWorkoutSetInput {
  return {
    type: s.type ?? "normal",
    weight_kg: s.weightKg ?? null,
    reps: s.reps ?? null,
    duration_seconds: s.durationSeconds ?? null,
    distance_meters: s.distanceMeters ?? null,
    rpe: s.rpe ?? null,
  };
}

function routineExercise(e: ExerciseIn): HevyRoutineExerciseInput {
  return {
    exercise_template_id: e.exerciseTemplateId,
    superset_id: e.supersetId ?? null,
    rest_seconds: e.restSeconds ?? null,
    notes: e.notes ?? null,
    sets: e.sets.map(routineSet),
  };
}

/** The routine's current exercises in PUT format (no `index`, one superset field). */
export function currentExercises(routine: HevyRoutine): HevyRoutineExerciseInput[] {
  return (routine.exercises ?? [])
    .filter((e) => e.exercise_template_id)
    .map((e) => ({
      exercise_template_id: e.exercise_template_id!,
      superset_id: e.superset_id ?? e.supersets_id ?? null,
      rest_seconds: e.rest_seconds ?? null,
      notes: e.notes || null,
      sets: (e.sets ?? []).map((s) => ({
        type: (["warmup", "normal", "failure", "dropset"].includes(s.type ?? "") ? s.type : "normal") as HevyRoutineSetInput["type"],
        weight_kg: s.weight_kg ?? null,
        reps: s.reps ?? null,
        distance_meters: s.distance_meters ?? null,
        duration_seconds: s.duration_seconds ?? null,
        custom_metric: s.custom_metric ?? null,
        rep_range: s.rep_range?.start != null && s.rep_range?.end != null ? { start: s.rep_range.start, end: s.rep_range.end } : null,
      })),
    }));
}

const sets = (x: HevyRoutineExerciseInput) => describeSets(x.sets);

/**
 * Applies the coach's operations to the routine. Fails (without partial results) when an
 * operation names an exercise that isn't in the routine or a template that doesn't exist.
 */
export function applyRoutineChanges(
  routine: HevyRoutine,
  changes: ChangeIn[],
  titles: Map<string, string>,
): { ok: true; exercises: HevyRoutineExerciseInput[]; lines: SummaryLine[] } | { ok: false; error: string } {
  const exercises = currentExercises(routine);
  const nameOf = (id: string) =>
    titles.get(id) ?? routine.exercises?.find((e) => e.exercise_template_id === id)?.title ?? id;
  const lines: SummaryLine[] = [];
  const touched = new Set<string>();
  const find = (id: string) => exercises.findIndex((e) => e.exercise_template_id === id);
  const known = (id: string) => titles.has(id);

  for (const c of changes) {
    if (c.op === "add") {
      if (!known(c.exercise.exerciseTemplateId)) return { ok: false, error: `unknown_exercise:${c.exercise.exerciseTemplateId}` };
      const ex = routineExercise(c.exercise);
      const after = c.afterExerciseTemplateId ? find(c.afterExerciseTemplateId) : -1;
      if (c.afterExerciseTemplateId && after < 0) return { ok: false, error: `not_in_routine:${c.afterExerciseTemplateId}` };
      exercises.splice(after >= 0 ? after + 1 : exercises.length, 0, ex);
      touched.add(ex.exercise_template_id);
      lines.push({ kind: "add", text: `Add ${nameOf(ex.exercise_template_id)} · ${sets(ex)}` });
      continue;
    }
    const i = find(c.exerciseTemplateId);
    if (i < 0) return { ok: false, error: `not_in_routine:${c.exerciseTemplateId}` };
    const cur = exercises[i]!;
    if (c.op === "remove") {
      exercises.splice(i, 1);
      lines.push({ kind: "remove", text: `Remove ${nameOf(c.exerciseTemplateId)}` });
    } else if (c.op === "replace") {
      if (!known(c.newExerciseTemplateId)) return { ok: false, error: `unknown_exercise:${c.newExerciseTemplateId}` };
      const next: HevyRoutineExerciseInput = {
        ...cur,
        exercise_template_id: c.newExerciseTemplateId,
        notes: c.notes ?? null,
        sets: c.sets ? c.sets.map(routineSet) : cur.sets.map((s) => ({ ...s, weight_kg: null })),
      };
      exercises[i] = next;
      touched.add(next.exercise_template_id);
      lines.push({ kind: "change", text: `Swap ${nameOf(c.exerciseTemplateId)} → ${nameOf(c.newExerciseTemplateId)} · ${sets(next)}` });
    } else {
      const next: HevyRoutineExerciseInput = {
        ...cur,
        sets: c.sets ? c.sets.map(routineSet) : cur.sets,
        rest_seconds: c.restSeconds ?? cur.rest_seconds,
        notes: c.notes ?? cur.notes,
      };
      exercises[i] = next;
      touched.add(next.exercise_template_id);
      const parts = [
        c.sets ? `${sets(cur)} → ${sets(next)}` : null,
        c.restSeconds !== undefined ? `rest ${cur.rest_seconds ?? "–"}s → ${c.restSeconds}s` : null,
        c.notes !== undefined ? "notes updated" : null,
      ].filter(Boolean);
      lines.push({ kind: "change", text: `${nameOf(c.exerciseTemplateId)}: ${parts.join(", ") || "no change"}` });
    }
  }
  if (!exercises.length) return { ok: false, error: "routine_would_be_empty" };
  const kept = exercises.filter((e) => !touched.has(e.exercise_template_id)).length;
  if (kept) lines.push({ kind: "keep", text: `${kept} other exercise${kept === 1 ? "" : "s"} unchanged` });
  return { ok: true, exercises, lines };
}

export function buildWorkoutBody(input: z.infer<typeof workoutLogInput>): HevyPostWorkoutBody {
  const start = new Date(input.startTime);
  const end = new Date(start.getTime() + input.durationMin * 60_000);
  return {
    workout: {
      title: input.title,
      description: input.description ?? null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      is_private: false,
      exercises: input.exercises.map((e) => ({
        exercise_template_id: e.exerciseTemplateId,
        superset_id: e.supersetId ?? null,
        notes: e.notes ?? null,
        sets: e.sets.map(workoutSet),
      })),
    },
  };
}

// ---------- store ----------

type ProposalRow = {
  id: string;
  kind: ProposalKind;
  routine_id: string | null;
  title: string;
  reason: string | null;
  payload: { body: unknown; baseUpdatedAt?: string | null; localDate?: string };
  summary: SummaryLine[];
  status: ProposalStatus;
  hevy_id: string | null;
  error: string | null;
};

const COLS = "id, kind, routine_id, title, reason, payload, summary, status, hevy_id, error";

export function cardFromRow(r: ProposalRow): HevyProposalCard {
  return {
    type: "hevy_proposal",
    proposalId: r.id,
    kind: r.kind,
    title: r.title,
    reason: r.reason,
    lines: r.summary,
    status: r.status,
    error: r.error,
  };
}

async function insertProposal(
  userProfileId: string,
  p: Omit<ProposalRow, "id" | "status" | "hevy_id" | "error">,
): Promise<{ ok: true; row: ProposalRow } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("health_hevy_proposals")
    .insert({ user_profile_id: userProfileId, ...p })
    .select(COLS)
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert_failed" };
  return { ok: true, row: data as ProposalRow };
}

export async function getProposals(userProfileId: string, ids: string[]): Promise<Map<string, ProposalRow>> {
  const out = new Map<string, ProposalRow>();
  if (!ids.length) return out;
  const { data } = await supabase
    .from("health_hevy_proposals")
    .select(COLS)
    .eq("user_profile_id", userProfileId)
    .in("id", ids);
  for (const r of (data ?? []) as ProposalRow[]) out.set(r.id, r);
  return out;
}

/** Moves a proposal to `applying` only if it's pending (or failed, for a retry). */
async function claimProposal(userProfileId: string, id: string): Promise<boolean> {
  const { data } = await supabase
    .from("health_hevy_proposals")
    .update({ status: "applying", error: null })
    .eq("user_profile_id", userProfileId)
    .eq("id", id)
    .in("status", ["pending", "failed"])
    .select("id");
  return (data ?? []).length > 0;
}

async function finishProposal(
  id: string,
  patch: { status: ProposalStatus; hevy_id?: string | null; error?: string | null },
): Promise<void> {
  await supabase
    .from("health_hevy_proposals")
    .update({ ...patch, applied_at: patch.status === "applied" ? new Date().toISOString() : null })
    .eq("id", id);
}

// ---------- actions ----------

type ProposeResult = { ok: true; card: HevyProposalCard } | { ok: false; error: string; detail?: unknown };

async function titlesFor(apiKey: string, ids: string[]): Promise<{ ok: true; titles: Map<string, string> } | { ok: false; error: string }> {
  const cat = await exerciseCatalog(apiKey);
  if (!cat.ok) return { ok: false, error: "hevy_unavailable" };
  const all = new Map(cat.templates.map((t: HevyExerciseTemplateBrief) => [t.id, t.title]));
  const missing = ids.filter((id) => !all.has(id));
  if (missing.length) return { ok: false, error: `unknown_exercise:${missing.join(",")}` };
  return { ok: true, titles: all };
}

export async function proposeRoutineChange(
  ctx: ActionContext,
  input: z.infer<typeof routineChangeInput>,
): Promise<ProposeResult> {
  const apiKey = await hevyKey(ctx.userProfileId);
  if (!apiKey) return { ok: false, error: "hevy_not_connected" };
  const routines = await loadRoutines(apiKey);
  if (!routines.ok) return { ok: false, error: "hevy_unavailable" };
  const routine = routines.routines.find((r) => r.id === input.routineId);
  if (!routine) return { ok: false, error: "routine_not_found" };
  const newIds = input.changes.flatMap((c) =>
    c.op === "add" ? [c.exercise.exerciseTemplateId] : c.op === "replace" ? [c.newExerciseTemplateId] : [],
  );
  const t = await titlesFor(apiKey, newIds);
  if (!t.ok) return t;
  const applied = applyRoutineChanges(routine, input.changes, t.titles);
  if (!applied.ok) return applied;
  const title = input.title ?? routine.title ?? "Routine";
  const lines = input.title && input.title !== routine.title ? [{ kind: "change" as const, text: `Rename to "${input.title}"` }, ...applied.lines] : applied.lines;
  const body: HevyPostRoutineBody = { routine: { title, notes: routine.notes ?? null, exercises: applied.exercises } };
  const saved = await insertProposal(ctx.userProfileId, {
    kind: "routine_update",
    routine_id: input.routineId,
    title,
    reason: input.reason,
    payload: { body, baseUpdatedAt: routine.updated_at ?? null },
    summary: lines,
  });
  return saved.ok ? { ok: true, card: cardFromRow(saved.row) } : saved;
}

export async function proposeNewRoutine(
  ctx: ActionContext,
  input: z.infer<typeof newRoutineInput>,
): Promise<ProposeResult> {
  const apiKey = await hevyKey(ctx.userProfileId);
  if (!apiKey) return { ok: false, error: "hevy_not_connected" };
  const t = await titlesFor(apiKey, input.exercises.map((e) => e.exerciseTemplateId));
  if (!t.ok) return t;
  const exercises = input.exercises.map(routineExercise);
  const body: HevyPostRoutineBody = { routine: { title: input.title, folder_id: null, notes: input.notes ?? null, exercises } };
  const saved = await insertProposal(ctx.userProfileId, {
    kind: "routine_create",
    routine_id: null,
    title: input.title,
    reason: input.reason ?? null,
    payload: { body },
    summary: exercises.map((e) => ({ kind: "add" as const, text: `${t.titles.get(e.exercise_template_id)} · ${sets(e)}` })),
  });
  return saved.ok ? { ok: true, card: cardFromRow(saved.row) } : saved;
}

export async function proposeWorkoutLog(
  ctx: ActionContext,
  input: z.infer<typeof workoutLogInput>,
): Promise<ProposeResult> {
  const now = ctx.now ?? new Date();
  if (new Date(input.startTime).getTime() > now.getTime() + 5 * 60_000) return { ok: false, error: "future_date" };
  const apiKey = await hevyKey(ctx.userProfileId);
  if (!apiKey) return { ok: false, error: "hevy_not_connected" };
  const t = await titlesFor(apiKey, input.exercises.map((e) => e.exerciseTemplateId));
  if (!t.ok) return t;
  const body = buildWorkoutBody(input);
  const localDate = localDateKey(new Date(input.startTime), ctx.timezone);
  const startLabel = new Date(input.startTime).toLocaleString("en-GB", {
    timeZone: ctx.timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const saved = await insertProposal(ctx.userProfileId, {
    kind: "workout_log",
    routine_id: null,
    title: input.title,
    reason: null,
    payload: { body, localDate },
    summary: [
      { kind: "info", text: `${startLabel} · ${input.durationMin} min` },
      ...body.workout.exercises.map((e) => ({
        kind: "add" as const,
        text: `${t.titles.get(e.exercise_template_id)} · ${describeSets(e.sets)}`,
      })),
    ],
  });
  return saved.ok ? { ok: true, card: cardFromRow(saved.row) } : saved;
}

type ApplyResult = { ok: boolean; status?: ProposalStatus; hevyId?: string | null; error?: string; alreadyApplied?: boolean };

/** Sends the stored payload to Hevy. Safe to call twice: an applied proposal is never re-sent. */
export async function applyProposal(ctx: ActionContext, id: string): Promise<ApplyResult> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "invalid_id" };
  const row = (await getProposals(ctx.userProfileId, [id])).get(id);
  if (!row) return { ok: false, error: "proposal_not_found" };
  if (row.status === "applied") return { ok: true, status: "applied", hevyId: row.hevy_id, alreadyApplied: true };
  if (row.status === "discarded") return { ok: false, error: "proposal_discarded" };
  if (row.status === "applying") return { ok: false, error: "proposal_in_progress" };
  const apiKey = await hevyKey(ctx.userProfileId);
  if (!apiKey) return { ok: false, error: "hevy_not_connected" };
  if (!(await claimProposal(ctx.userProfileId, id))) return { ok: false, error: "proposal_in_progress" };

  const fail = async (error: string): Promise<ApplyResult> => {
    await finishProposal(id, { status: "failed", error });
    return { ok: false, status: "failed", error };
  };

  if (row.kind === "routine_update") {
    // Don't overwrite edits made in Hevy after the proposal was built.
    const routines = await loadRoutines(apiKey);
    if (!routines.ok) return fail("hevy_unavailable");
    const live = routines.routines.find((r) => r.id === row.routine_id);
    if (!live) return fail("routine_not_found");
    if (row.payload.baseUpdatedAt && live.updated_at && live.updated_at !== row.payload.baseUpdatedAt) {
      return fail("routine_changed_in_hevy");
    }
    const r = await updateHevyRoutine(apiKey, row.routine_id!, row.payload.body as HevyPostRoutineBody);
    if (!r.ok) return fail(r.error.slice(0, 300));
    await finishProposal(id, { status: "applied", hevy_id: r.routine.id ?? row.routine_id, error: null });
    return { ok: true, status: "applied", hevyId: r.routine.id ?? row.routine_id };
  }
  if (row.kind === "routine_create") {
    const r = await createHevyRoutine(apiKey, row.payload.body as HevyPostRoutineBody);
    if (!r.ok) return fail(r.error.slice(0, 300));
    await finishProposal(id, { status: "applied", hevy_id: r.routine.id ?? null, error: null });
    return { ok: true, status: "applied", hevyId: r.routine.id ?? null };
  }
  const r = await createHevyWorkout(apiKey, row.payload.body as HevyPostWorkoutBody);
  if (!r.ok) return fail(r.error.slice(0, 300));
  await finishProposal(id, { status: "applied", hevy_id: r.workout.id ?? null, error: null });
  // A logged workout settles that day's "did you train?" check.
  const date = row.payload.localDate;
  if (date) {
    const check = (await getWorkoutChecks(ctx.userProfileId, date, date)).get(date);
    if (check && check.status !== "found") {
      await saveWorkoutCheckAnswer(ctx.userProfileId, { ...check, status: "found", hevyWorkoutId: r.workout.id ?? null, reason: null });
    }
  }
  return { ok: true, status: "applied", hevyId: r.workout.id ?? null };
}

export async function discardProposal(ctx: ActionContext, id: string): Promise<{ ok: boolean; error?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "invalid_id" };
  const { data, error } = await supabase
    .from("health_hevy_proposals")
    .update({ status: "discarded" })
    .eq("user_profile_id", ctx.userProfileId)
    .eq("id", id)
    .in("status", ["pending", "failed"])
    .select("id");
  if (error) return { ok: false, error: error.message };
  return (data ?? []).length ? { ok: true } : { ok: false, error: "proposal_not_pending" };
}
