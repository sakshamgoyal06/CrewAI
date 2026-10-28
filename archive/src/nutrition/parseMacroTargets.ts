/**
 * Parse daily macro targets from free-text user messages.
 */
export type ParsedMacroTargets = {
  daily_calorie_target: number | null;
  daily_protein_g_target: number | null;
  daily_carbs_g_target: number | null;
  daily_fat_g_target: number | null;
};

function firstMatch(text: string, re: RegExp): number | null {
  const m = text.match(re);
  if (!m?.[1]) {
    return null;
  }
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseMacroTargetsFromText(raw: string): ParsedMacroTargets {
  const text = raw.trim().toLowerCase();
  if (!text || text === "skip" || text === "none" || text === "not sure") {
    return {
      daily_calorie_target: null,
      daily_protein_g_target: null,
      daily_carbs_g_target: null,
      daily_fat_g_target: null,
    };
  }

  return {
    daily_calorie_target:
      firstMatch(text, /(\d{3,5})\s*(?:kcal|cal(?:ories)?|cals)\b/) ??
      firstMatch(text, /\bcalories?\s*(?:to|at|of|:)?\s*(\d{3,5})\b/),
    daily_protein_g_target:
      firstMatch(text, /(\d{2,4})\s*g?\s*protein\b/) ??
      firstMatch(text, /\bprotein\s*(?:to|at|of|:)?\s*(\d{2,4})\s*g?\b/),
    daily_carbs_g_target:
      firstMatch(text, /(\d{2,4})\s*g?\s*carbs?\b/) ??
      firstMatch(text, /\bcarbs?\s*(?:to|at|of|:)?\s*(\d{2,4})\s*g?\b/),
    daily_fat_g_target:
      firstMatch(text, /(\d{1,3})\s*g?\s*fat\b/) ??
      firstMatch(text, /\bfat\s*(?:to|at|of|:)?\s*(\d{1,3})\s*g?\b/),
  };
}

export function formatMacroTargetsSummary(targets: ParsedMacroTargets): string {
  const parts: string[] = [];
  if (targets.daily_calorie_target) {
    parts.push(`${targets.daily_calorie_target} kcal/day`);
  }
  if (targets.daily_protein_g_target) {
    parts.push(`${targets.daily_protein_g_target}g protein/day`);
  }
  if (targets.daily_carbs_g_target) {
    parts.push(`${targets.daily_carbs_g_target}g carbs/day`);
  }
  if (targets.daily_fat_g_target) {
    parts.push(`${targets.daily_fat_g_target}g fat/day`);
  }
  return parts.length ? parts.join(" · ") : "none set yet";
}

export function hasAnyMacroTarget(targets: ParsedMacroTargets): boolean {
  return (
    targets.daily_calorie_target !== null ||
    targets.daily_protein_g_target !== null ||
    targets.daily_carbs_g_target !== null ||
    targets.daily_fat_g_target !== null
  );
}
