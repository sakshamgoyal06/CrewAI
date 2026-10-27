/**
 * Persist daily macro targets on user_health_profile.
 */
import { supabase } from "../../tools/clients.js";
import {
  formatMacroTargetsSummary,
  hasAnyMacroTarget,
  parseMacroTargetsFromText,
  type ParsedMacroTargets,
} from "../parseMacroTargets.js";

export async function saveMacroTargets(
  userProfileId: string,
  targets: ParsedMacroTargets,
): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  if (!hasAnyMacroTarget(targets)) {
    return { ok: false, error: "no targets parsed" };
  }

  const patch: Record<string, unknown> = {
    macro_targets_set_at: new Date().toISOString(),
  };
  if (targets.daily_calorie_target !== null) {
    patch.daily_calorie_target = targets.daily_calorie_target;
  }
  if (targets.daily_protein_g_target !== null) {
    patch.daily_protein_g_target = targets.daily_protein_g_target;
  }
  if (targets.daily_carbs_g_target !== null) {
    patch.daily_carbs_g_target = targets.daily_carbs_g_target;
  }
  if (targets.daily_fat_g_target !== null) {
    patch.daily_fat_g_target = targets.daily_fat_g_target;
  }

  const { error } = await supabase
    .from("user_health_profile")
    .update(patch)
    .eq("user_profile_id", userProfileId);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, summary: formatMacroTargetsSummary(targets) };
}

export function parseAndValidateTargets(raw: string): ParsedMacroTargets {
  return parseMacroTargetsFromText(raw);
}
