/**
 * DB-backed meal planning session (draft until user locks).
 */
import { logger } from "../../logger.js";
import { supabase } from "../../tools/clients.js";
import { loggableError } from "../../util/loggableError.js";
import type { MealPlanEntryInput } from "../parseMealPlanJson.js";
import type { PlannedSlot } from "./parsePlanningSlots.js";

export type MealPlanSessionStatus = "gathering" | "draft" | "locked" | "abandoned";
export type MealPlanSessionStep = "horizon" | "slots" | "constraints" | "review";

export type MealPlanSessionRow = {
  id: string;
  user_profile_id: string;
  status: MealPlanSessionStatus;
  step: MealPlanSessionStep;
  horizon_start: string | null;
  horizon_end: string | null;
  slots: PlannedSlot[];
  constraints_text: string | null;
  draft_entries: MealPlanEntryInput[];
  draft_display: string | null;
  revision_notes: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
};

function isTableMissing(msg: string): boolean {
  return (
    msg.includes("meal_plan_sessions") ||
    msg.includes("schema cache") ||
    msg.includes("does not exist")
  );
}

function normalizeDraftEntries(raw: unknown): MealPlanEntryInput[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(
    (e): e is MealPlanEntryInput =>
      !!e &&
      typeof e === "object" &&
      typeof (e as MealPlanEntryInput).local_date === "string" &&
      typeof (e as MealPlanEntryInput).meal_slot === "string" &&
      typeof (e as MealPlanEntryInput).title === "string",
  );
}

export async function getActiveMealPlanSession(
  userProfileId: string,
): Promise<MealPlanSessionRow | null> {
  const { data, error } = await supabase
    .from("meal_plan_sessions")
    .select("*")
    .eq("user_profile_id", userProfileId)
    .in("status", ["gathering", "draft"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isTableMissing(error.message)) {
      return null;
    }
    logger.warn({ err: loggableError(error), userProfileId }, "meal plan session select failed");
    return null;
  }
  if (!data) {
    return null;
  }

  return {
    ...(data as MealPlanSessionRow),
    slots: Array.isArray(data.slots) ? (data.slots as PlannedSlot[]) : ["breakfast", "lunch", "dinner"],
    draft_entries: normalizeDraftEntries(data.draft_entries),
  };
}

export async function createMealPlanSession(
  userProfileId: string,
): Promise<{ ok: true; session: MealPlanSessionRow } | { ok: false; error: string }> {
  const existing = await getActiveMealPlanSession(userProfileId);
  if (existing) {
    return { ok: true, session: existing };
  }

  const { data, error } = await supabase
    .from("meal_plan_sessions")
    .insert({
      user_profile_id: userProfileId,
      status: "gathering",
      step: "horizon",
    })
    .select("*")
    .single();

  if (error) {
    if (isTableMissing(error.message)) {
      return { ok: false, error: "meal_plan_sessions table missing — apply migration" };
    }
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    session: {
      ...(data as MealPlanSessionRow),
      slots: ["breakfast", "lunch", "dinner"],
      draft_entries: [],
    },
  };
}

export async function updateMealPlanSession(
  sessionId: string,
  patch: Partial<{
    status: MealPlanSessionStatus;
    step: MealPlanSessionStep;
    horizon_start: string | null;
    horizon_end: string | null;
    slots: PlannedSlot[];
    constraints_text: string | null;
    draft_entries: MealPlanEntryInput[];
    draft_display: string | null;
    revision_notes: string | null;
  }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };

  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      payload[key] = value;
    }
  }

  const { error } = await supabase.from("meal_plan_sessions").update(payload).eq("id", sessionId);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function abandonMealPlanSession(
  sessionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return updateMealPlanSession(sessionId, { status: "abandoned", step: "horizon" });
}

export async function lockMealPlanSession(
  sessionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return updateMealPlanSession(sessionId, { status: "locked", step: "review" });
}
