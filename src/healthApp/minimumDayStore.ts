/** Minimum days in the database (minimumDay.ts has the rules). */
import { logger } from "../logger.js";
import { supabase } from "../tools/clients.js";
import { addDays } from "../util/time.js";
import { loggableError } from "../util/loggableError.js";
import { canSetMinimum, minimumAsks } from "./minimumDay.js";

let warned = false;

/** Minimum days from `from` on. Empty (never throws) while the table doesn't exist yet. */
export async function loadMinimumDays(userProfileId: string, from: string): Promise<Set<string>> {
  const { data, error } = await supabase.from("health_minimum_days").select("local_date").eq("user_profile_id", userProfileId).gte("local_date", from);
  if (error) {
    if (!warned) logger.warn({ err: loggableError(error) }, "minimum days unavailable (has the migration run?)");
    warned = true;
    return new Set();
  }
  return new Set((data ?? []).map((r) => String(r.local_date).slice(0, 10)));
}

export type SetMinimumResult = { ok: true; date: string; on: boolean; asks: ReturnType<typeof minimumAsks> } | { ok: false; error: string; max?: number };

/** Turns a minimum day on or off for `date` (today or yesterday). */
export async function setMinimumDay(
  userProfileId: string,
  date: string,
  on: boolean,
  today: string,
  targets: { proteinTarget: number | null; stepTarget: number },
): Promise<SetMinimumResult> {
  const asks = minimumAsks(targets);
  if (!on) {
    const { error } = await supabase.from("health_minimum_days").delete().eq("user_profile_id", userProfileId).eq("local_date", date);
    return error ? { ok: false, error: error.message } : { ok: true, date, on, asks };
  }
  const existing = await loadMinimumDays(userProfileId, addDays(today, -13));
  const check = canSetMinimum(existing, date, today);
  if (!check.ok) return check;
  const { error } = await supabase.from("health_minimum_days").upsert({ user_profile_id: userProfileId, local_date: date }, { onConflict: "user_profile_id,local_date" });
  return error ? { ok: false, error: error.message } : { ok: true, date, on, asks };
}
