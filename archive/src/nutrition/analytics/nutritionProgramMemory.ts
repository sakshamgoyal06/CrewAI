/**
 * Sync persistent nutrition lapse patterns into `user_program_memory.program_learnings`.
 */
import { loadUserProgramMemory, upsertUserProgramMemory } from "../../users/userProgramMemory.js";
import { supabase } from "../../tools/clients.js";
import { offsetDateKey } from "./anomalyDetector.js";

const PERSISTENCE_MIN_DAYS = 7;
const PERSISTENCE_LOOKBACK_DAYS = 14;

const NUTRITION_SECTION_HEADING = "## Nutrition patterns (auto)";

type RollupFlagRow = {
  local_date: string;
  flags: unknown;
  slots_missed: string[] | null;
};

function parseFlags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((f): f is string => typeof f === "string");
  }
  return [];
}

function countFlagDays(rows: RollupFlagRow[], flag: string): number {
  return rows.filter((r) => parseFlags(r.flags).includes(flag)).length;
}

function habitualMissedSlots(rows: RollupFlagRow[]): string[] {
  const slots = new Set<string>();
  for (const row of rows) {
    if (!parseFlags(row.flags).includes("slot_habitually_missed")) {
      continue;
    }
    for (const slot of row.slots_missed ?? []) {
      slots.add(slot);
    }
  }
  return [...slots];
}

function buildNutritionBlock(rows: RollupFlagRow[]): string | null {
  const lines: string[] = [];
  const loggingGapDays = countFlagDays(rows, "logging_gap");
  const proteinLowDays = countFlagDays(rows, "protein_low");
  const planDriftDays = countFlagDays(rows, "plan_drift");
  const missedSlots = habitualMissedSlots(rows);

  if (loggingGapDays >= PERSISTENCE_MIN_DAYS) {
    lines.push(
      `- Logging gaps on ${loggingGapDays} of the last ${PERSISTENCE_LOOKBACK_DAYS} days — gentle reminders, not shame.`,
    );
  }
  if (proteinLowDays >= PERSISTENCE_MIN_DAYS) {
    lines.push(
      `- Protein below target on ${proteinLowDays} of the last ${PERSISTENCE_LOOKBACK_DAYS} days — suggest easy protein anchors.`,
    );
  }
  if (planDriftDays >= PERSISTENCE_MIN_DAYS) {
    lines.push(
      `- Plan drift on ${planDriftDays} of the last ${PERSISTENCE_LOOKBACK_DAYS} days — simplify plan or adjust slots.`,
    );
  }
  if (missedSlots.length) {
    lines.push(
      `- Habitually missed slots: ${missedSlots.join(", ")} — check timing or swap planned meals.`,
    );
  }

  if (!lines.length) {
    return null;
  }

  return [NUTRITION_SECTION_HEADING, ...lines].join("\n");
}

function mergeProgramLearnings(existingBody: string, nutritionBlock: string | null): string {
  const withoutAuto = existingBody
    .split("\n")
    .reduce<{ lines: string[]; inAuto: boolean }>(
      (acc, line) => {
        if (line.trim() === NUTRITION_SECTION_HEADING) {
          return { lines: acc.lines, inAuto: true };
        }
        if (acc.inAuto && line.startsWith("## ")) {
          return { lines: [...acc.lines, line], inAuto: false };
        }
        if (acc.inAuto) {
          return acc;
        }
        return { lines: [...acc.lines, line], inAuto: false };
      },
      { lines: [], inAuto: false },
    )
    .lines.join("\n")
    .trim();

  if (!nutritionBlock) {
    return withoutAuto;
  }

  if (!withoutAuto) {
    return nutritionBlock;
  }
  return `${withoutAuto}\n\n${nutritionBlock}`;
}

export async function syncNutritionProgramMemory(
  userProfileId: string,
  endDate: string,
): Promise<{ ok: boolean; updated: boolean; error?: string }> {
  const fromDate = offsetDateKey(endDate, -(PERSISTENCE_LOOKBACK_DAYS - 1));

  const { data, error } = await supabase
    .from("meal_daily_rollups")
    .select("local_date, flags, slots_missed")
    .eq("user_profile_id", userProfileId)
    .gte("local_date", fromDate)
    .lte("local_date", endDate)
    .order("local_date", { ascending: true });

  if (error) {
    const msg = error.message ?? String(error);
    if (msg.includes("meal_daily_rollups") || msg.includes("does not exist")) {
      return { ok: true, updated: false };
    }
    return { ok: false, updated: false, error: msg };
  }

  const nutritionBlock = buildNutritionBlock((data ?? []) as RollupFlagRow[]);
  const rows = await loadUserProgramMemory(userProfileId);
  const existing = rows.find((r) => r.section === "program_learnings")?.body ?? "";
  const merged = mergeProgramLearnings(existing, nutritionBlock);

  if (merged === existing.trim()) {
    return { ok: true, updated: false };
  }

  const res = await upsertUserProgramMemory({
    userProfileId,
    section: "program_learnings",
    body: merged.trim(),
  });

  return { ok: res.ok, updated: res.ok, error: res.error };
}
