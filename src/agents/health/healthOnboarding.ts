/**
 * First-time Health onboarding: multi-turn, DB-backed, LifeOS-aligned tone.
 * Continues until `onboarding_completed_at` is set (any message advances while incomplete).
 */
import { supabase } from "../../tools/clients.js";
import { logger } from "../../logger.js";
import { loggableError } from "../../util/loggableError.js";
import {
  formatMacroTargetsSummary,
  hasAnyMacroTarget,
  parseMacroTargetsFromText,
} from "../../nutrition/parseMacroTargets.js";

export type UserHealthProfileRow = {
  id: string;
  user_profile_id: string;
  onboarding_completed_at: string | null;
  next_question: "fitness" | "diet" | "timing" | "restrictions" | "targets" | "done";
  fitness_goals: string | null;
  diet_preferences: string | null;
  meal_timing_notes: string | null;
  dietary_restrictions: string | null;
  daily_calorie_target?: number | null;
  daily_protein_g_target?: number | null;
  daily_carbs_g_target?: number | null;
  daily_fat_g_target?: number | null;
};

const INTRO = `Welcome to Health in Magnus — I'll remember a few basics so fitness, nutrition, and energy advice fits you (no shame, one step at a time).

We'll do five short questions (the last is optional). Reply in your own words; you can say "skip" anytime to finish with what we have so far.

1 — Fitness
What are your main fitness goals for the next few months? (e.g. strength, fat loss, running a distance, consistency, rehab-safe training.)`;

const Q_DIET = `2 — Nutrition
What’s your eating style or preferences? (e.g. high protein, vegetarian, intermittent fasting, “no rules”, foods you enjoy.)`;

const Q_TIMING = `3 — Timing
Rough meal timing or schedule? (e.g. breakfast 8am, lunch at work, late dinner, fasting window.)`;

const Q_RESTRICTIONS = `4 — Safety
Any allergies, intolerances, or foods to avoid? (If none, say "none".)`;

const Q_TARGETS = `5 — Targets (optional)
Daily calorie and macro targets? (e.g. "2000 kcal, 140g protein" — or say "skip".)`;

function isSkipMessage(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  return t === "skip" || t === "skip onboarding" || t === "done";
}

function summarizeProfile(row: UserHealthProfileRow): string {
  const parts: string[] = [];
  if (row.fitness_goals?.trim()) {
    parts.push(`Fitness goals: ${row.fitness_goals.trim()}`);
  }
  if (row.diet_preferences?.trim()) {
    parts.push(`Diet / preferences: ${row.diet_preferences.trim()}`);
  }
  if (row.meal_timing_notes?.trim()) {
    parts.push(`Meal timing: ${row.meal_timing_notes.trim()}`);
  }
  if (row.dietary_restrictions?.trim()) {
    parts.push(`Restrictions / allergies: ${row.dietary_restrictions.trim()}`);
  }
  const targets = formatMacroTargetsSummary({
    daily_calorie_target: row.daily_calorie_target ?? null,
    daily_protein_g_target: row.daily_protein_g_target ?? null,
    daily_carbs_g_target: row.daily_carbs_g_target ?? null,
    daily_fat_g_target: row.daily_fat_g_target ?? null,
  });
  if (hasAnyMacroTarget({
    daily_calorie_target: row.daily_calorie_target ?? null,
    daily_protein_g_target: row.daily_protein_g_target ?? null,
    daily_carbs_g_target: row.daily_carbs_g_target ?? null,
    daily_fat_g_target: row.daily_fat_g_target ?? null,
  })) {
    parts.push(`Daily targets: ${targets}`);
  }
  if (parts.length === 0) {
    return "I’ve saved your Health profile — you can update details anytime by talking to Health again.";
  }
  return `Here’s what I saved:\n\n${parts.join("\n")}\n\nYou can ask about training, meals, sleep, or recovery whenever you like.`;
}

/**
 * Load health profile row for this user, or null if none.
 */
export async function fetchUserHealthProfile(
  userProfileId: string,
): Promise<UserHealthProfileRow | null> {
  const { data, error } = await supabase
    .from("user_health_profile")
    .select(
      "id, user_profile_id, onboarding_completed_at, next_question, fitness_goals, diet_preferences, meal_timing_notes, dietary_restrictions, daily_calorie_target, daily_protein_g_target, daily_carbs_g_target, daily_fat_g_target",
    )
    .eq("user_profile_id", userProfileId)
    .maybeSingle();

  if (error) {
    logger.warn(
      { err: loggableError(error), userProfileId },
      "user_health_profile select failed — onboarding degraded",
    );
    return null;
  }
  if (!data) {
    return null;
  }
  return data as UserHealthProfileRow;
}

async function insertProfile(
  userProfileId: string,
): Promise<{ ok: boolean; error?: string; duplicate?: boolean }> {
  const { error } = await supabase.from("user_health_profile").insert({
    user_profile_id: userProfileId,
    next_question: "fitness",
  });
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      return { ok: false, duplicate: true, error: error.message };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

async function updateProfile(
  userProfileId: string,
  patch: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("user_health_profile")
    .update(patch)
    .eq("user_profile_id", userProfileId);
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export type HealthOnboardingInput = {
  userMessage: string;
  userProfileId: string;
  telegramUserId: string;
};

/**
 * First HEALTH message: create row and send intro + first question.
 */
export async function startHealthOnboarding(
  input: HealthOnboardingInput,
): Promise<{ text: string; metadata: Record<string, unknown> }> {
  const ins = await insertProfile(input.userProfileId);
  if (!ins.ok && ins.duplicate) {
    const row = await fetchUserHealthProfile(input.userProfileId);
    if (row && !row.onboarding_completed_at) {
      return runHealthOnboardingTurn(input, row);
    }
  }
  if (!ins.ok) {
    return {
      text: "I couldn’t start Health onboarding right now (storage issue). Try again in a moment, or ask an admin to check logs.",
      metadata: {
        specialist: "HealthOnboarding",
        health_onboarding: "error",
        error: ins.error,
      },
    };
  }
  return {
    text: INTRO,
    metadata: {
      specialist: "HealthOnboarding",
      health_onboarding: "started",
      step: "fitness_prompt",
    },
  };
}

/**
 * Advance onboarding using the current row and the user message.
 */
export async function runHealthOnboardingTurn(
  input: HealthOnboardingInput,
  row: UserHealthProfileRow,
): Promise<{ text: string; metadata: Record<string, unknown> }> {
  if (row.onboarding_completed_at) {
    return {
      text: "Your Health profile is already set up. Ask me anything about training, meals, or recovery.",
      metadata: { specialist: "HealthOnboarding", health_onboarding: "already_complete" },
    };
  }

  if (isSkipMessage(input.userMessage)) {
    const done = await updateProfile(input.userProfileId, {
      onboarding_completed_at: new Date().toISOString(),
      next_question: "done",
    });
    if (!done.ok) {
      return {
        text: "Couldn’t save skip — please try again.",
        metadata: { specialist: "HealthOnboarding", health_onboarding: "error", error: done.error },
      };
    }
    return {
      text: `${summarizeProfile(row)}\n\n(You skipped the rest — we can fill in details anytime.)`,
      metadata: { specialist: "HealthOnboarding", health_onboarding: "skipped" },
    };
  }

  const msg = input.userMessage.trim();

  switch (row.next_question) {
    case "fitness": {
      if (!row.fitness_goals) {
        const next = await updateProfile(input.userProfileId, {
          fitness_goals: msg,
          next_question: "diet",
        });
        if (!next.ok) {
          return {
            text: "Couldn’t save your answer — try again.",
            metadata: { specialist: "HealthOnboarding", health_onboarding: "error", error: next.error },
          };
        }
        return {
          text: `Got it — thanks.\n\n${Q_DIET}`,
          metadata: { specialist: "HealthOnboarding", health_onboarding: "step", step: "diet" },
        };
      }
      return {
        text: "Onboarding state looks out of sync — say skip to finish, or try again later.",
        metadata: { specialist: "HealthOnboarding", health_onboarding: "sync_error" },
      };
    }
    case "diet": {
      const next = await updateProfile(input.userProfileId, {
        diet_preferences: msg,
        next_question: "timing",
      });
      if (!next.ok) {
        return {
          text: "Couldn’t save your answer — try again.",
          metadata: { specialist: "HealthOnboarding", health_onboarding: "error", error: next.error },
        };
      }
      return {
        text: `Noted.\n\n${Q_TIMING}`,
        metadata: { specialist: "HealthOnboarding", health_onboarding: "step", step: "timing" },
      };
    }
    case "timing": {
      const next = await updateProfile(input.userProfileId, {
        meal_timing_notes: msg,
        next_question: "restrictions",
      });
      if (!next.ok) {
        return {
          text: "Couldn’t save your answer — try again.",
          metadata: { specialist: "HealthOnboarding", health_onboarding: "error", error: next.error },
        };
      }
      return {
        text: `Thanks.\n\n${Q_RESTRICTIONS}`,
        metadata: { specialist: "HealthOnboarding", health_onboarding: "step", step: "restrictions" },
      };
    }
    case "restrictions": {
      const next = await updateProfile(input.userProfileId, {
        dietary_restrictions: msg,
        next_question: "targets",
      });
      if (!next.ok) {
        return {
          text: "Couldn't save your answer — try again.",
          metadata: { specialist: "HealthOnboarding", health_onboarding: "error", error: next.error },
        };
      }
      return {
        text: `Thanks.\n\n${Q_TARGETS}`,
        metadata: { specialist: "HealthOnboarding", health_onboarding: "step", step: "targets" },
      };
    }
    case "targets": {
      const parsed = parseMacroTargetsFromText(msg);
      const patch: Record<string, unknown> = {
        onboarding_completed_at: new Date().toISOString(),
        next_question: "done",
      };
      if (hasAnyMacroTarget(parsed)) {
        if (parsed.daily_calorie_target !== null) {
          patch.daily_calorie_target = parsed.daily_calorie_target;
        }
        if (parsed.daily_protein_g_target !== null) {
          patch.daily_protein_g_target = parsed.daily_protein_g_target;
        }
        if (parsed.daily_carbs_g_target !== null) {
          patch.daily_carbs_g_target = parsed.daily_carbs_g_target;
        }
        if (parsed.daily_fat_g_target !== null) {
          patch.daily_fat_g_target = parsed.daily_fat_g_target;
        }
        patch.macro_targets_set_at = new Date().toISOString();
      }

      const updated: UserHealthProfileRow = {
        ...row,
        dietary_restrictions: row.dietary_restrictions,
        daily_calorie_target: parsed.daily_calorie_target,
        daily_protein_g_target: parsed.daily_protein_g_target,
        daily_carbs_g_target: parsed.daily_carbs_g_target,
        daily_fat_g_target: parsed.daily_fat_g_target,
      };

      const fin = await updateProfile(input.userProfileId, patch);
      if (!fin.ok) {
        return {
          text: "Couldn't finish onboarding — try again.",
          metadata: { specialist: "HealthOnboarding", health_onboarding: "error", error: fin.error },
        };
      }
      return {
        text: `You're all set.\n\n${summarizeProfile(updated)}`,
        metadata: { specialist: "HealthOnboarding", health_onboarding: "complete" },
      };
    }
    case "done":
      return {
        text: "Your Health profile is already set up. Ask me anything about training, meals, or recovery.",
        metadata: { specialist: "HealthOnboarding", health_onboarding: "already_complete" },
      };
    default:
      break;
  }

  return {
    text: "Something’s off in onboarding state. Say \"skip\" to finish, or try Health again later.",
    metadata: { specialist: "HealthOnboarding", health_onboarding: "unexpected_state" },
  };
}

/**
 * Format saved preferences for specialist prompts (after onboarding completed).
 */
export function formatHealthPreferencesForPrompt(row: UserHealthProfileRow | null): string {
  if (!row?.onboarding_completed_at) {
    return "";
  }
  const lines: string[] = [];
  if (row.fitness_goals?.trim()) {
    lines.push(`Fitness goals (on file): ${row.fitness_goals.trim()}`);
  }
  if (row.diet_preferences?.trim()) {
    lines.push(`Diet preferences (on file): ${row.diet_preferences.trim()}`);
  }
  if (row.meal_timing_notes?.trim()) {
    lines.push(`Meal timing (on file): ${row.meal_timing_notes.trim()}`);
  }
  if (row.dietary_restrictions?.trim()) {
    lines.push(`Dietary restrictions (on file): ${row.dietary_restrictions.trim()}`);
  }
  if (
    hasAnyMacroTarget({
      daily_calorie_target: row.daily_calorie_target ?? null,
      daily_protein_g_target: row.daily_protein_g_target ?? null,
      daily_carbs_g_target: row.daily_carbs_g_target ?? null,
      daily_fat_g_target: row.daily_fat_g_target ?? null,
    })
  ) {
    lines.push(
      `Daily macro targets (on file): ${formatMacroTargetsSummary({
        daily_calorie_target: row.daily_calorie_target ?? null,
        daily_protein_g_target: row.daily_protein_g_target ?? null,
        daily_carbs_g_target: row.daily_carbs_g_target ?? null,
        daily_fat_g_target: row.daily_fat_g_target ?? null,
      })}`,
    );
  }
  if (lines.length === 0) {
    return "";
  }
  return `\n\nUser Health profile (onboarding):\n${lines.join("\n")}`;
}
