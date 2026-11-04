/**
 * How the meal plan is going: of the planned meals in a window, how many were eaten as planned,
 * eaten with changed portions, replaced by something else, or never logged; and the meal that
 * slips most. Feeds the weekly review and the morning card's "worth a look" line. Pure over rows.
 */
import { supabase } from "../../tools/clients.js";
import { addDays } from "../../util/time.js";
import { PLAN_SLOTS, type PlanSlot } from "./targets.js";

export type EntryLite = { date: string; slot: PlanSlot; status: string; offPlan: boolean; kind: string };

export type Adherence = {
  planned: number;
  asPlanned: number;
  portionsChanged: number;
  offPlan: number;
  notLogged: number;
  /** The meal that slips most (off plan or not logged), when it slipped on enough days to matter. */
  slipping: { slot: PlanSlot; slipped: number; of: number; mostlyOffPlan: boolean } | null;
};

/** A meal has to slip on at least this many of the window's days to be named. */
export const SLIP_MIN_DAYS = 4;

const SLOT_LABEL: Record<PlanSlot, string> = { breakfast: "Breakfast", lunch: "Lunch", snack: "The snack", dinner: "Dinner" };

/** Rows of past days only (today isn't over). Eat-out meals count as followed when logged. */
export function adherenceOf(rows: EntryLite[]): Adherence {
  const a: Adherence = { planned: rows.length, asPlanned: 0, portionsChanged: 0, offPlan: 0, notLogged: 0, slipping: null };
  const bySlot = new Map<PlanSlot, { of: number; off: number; missing: number }>();
  for (const r of rows) {
    const s = bySlot.get(r.slot) ?? { of: 0, off: 0, missing: 0 };
    s.of += 1;
    if (r.status === "planned") {
      a.notLogged += 1;
      s.missing += 1;
    } else if (r.offPlan && r.kind !== "eat_out") {
      a.offPlan += 1;
      s.off += 1;
    } else if (r.status === "partial") a.portionsChanged += 1;
    else a.asPlanned += 1;
    bySlot.set(r.slot, s);
  }
  for (const slot of PLAN_SLOTS) {
    const s = bySlot.get(slot);
    if (!s) continue;
    const slipped = s.off + s.missing;
    if (slipped >= SLIP_MIN_DAYS && (!a.slipping || slipped > a.slipping.slipped)) {
      a.slipping = { slot, slipped, of: s.of, mostlyOffPlan: s.off >= s.missing };
    }
  }
  return a;
}

/** One line for the review or the morning card; null when there's nothing worth saying. */
export function adherenceLine(a: Adherence): string | null {
  if (!a.planned) return null;
  const followed = a.asPlanned + a.portionsChanged;
  const head = `${followed} of ${a.planned} planned meals eaten from the plan${a.portionsChanged ? ` (${a.portionsChanged} with changed portions)` : ""}.`;
  if (!a.slipping) return head;
  const s = a.slipping;
  const fix = s.mostlyOffPlan
    ? "Swap it in the Meals tab for something you'd actually eat, or pin your usual one."
    : "If it's often eaten out or skipped, set that in the Meals tab so the rest of the day plans around it.";
  return `${head} ${SLOT_LABEL[s.slot]} went ${s.mostlyOffPlan ? "off plan" : "unlogged"} on ${s.slipped} of ${s.of} days. ${fix}`;
}

/** The last `days` complete days before `today`. */
export async function loadAdherence(userProfileId: string, today: string, days = 7): Promise<Adherence | null> {
  const { data, error } = await supabase
    .from("meal_plan_entries")
    .select("local_date, meal_slot, status, metadata")
    .eq("user_profile_id", userProfileId)
    .eq("source", "plan")
    .gte("local_date", addDays(today, -days))
    .lt("local_date", today)
    .in("status", ["planned", "logged", "partial"]);
  if (error) return null;
  const rows = (data ?? []) as Array<{ local_date: string; meal_slot: PlanSlot; status: string; metadata: Record<string, unknown> | null }>;
  if (!rows.length) return null;
  return adherenceOf(rows.map((r) => ({ date: r.local_date, slot: r.meal_slot, status: r.status, offPlan: r.metadata?.off_plan === true, kind: String(r.metadata?.kind ?? "option") })));
}
