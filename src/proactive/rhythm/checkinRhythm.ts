import { fetchCheckinItem, fetchListBySlug } from "../../lists/listStore.js";
import { offsetDateKey } from "../../nutrition/parseMealPlanJson.js";
import { supabase } from "../../tools/clients.js";

const MORNING_EXTRA_KEYS = ["Morning Intention", "Energy Level"] as const;

export async function hasMorningOrientationToday(
  userProfileId: string,
  dateKey: string,
): Promise<boolean> {
  const list = await fetchListBySlug(userProfileId, "checkins");
  if (!list.ok || !list.data) {
    return false;
  }
  const item = await fetchCheckinItem(userProfileId, list.data.id, dateKey);
  if (!item.ok || !item.data) {
    return false;
  }
  const extra = item.data.extra ?? {};
  return MORNING_EXTRA_KEYS.some((k) => {
    const v = extra[k];
    return v != null && String(v).trim() !== "";
  });
}

/**
 * Consecutive days before `dateKey` with no morning orientation captured.
 *
 * The brief asked "what's the one thing that makes today a win?" twenty-four mornings in a
 * row, got no answer, and never noticed. Counting the silence lets it change the ask.
 */
export async function countDaysWithoutMorningOrientation(
  userProfileId: string,
  dateKey: string,
  lookbackDays = 7,
): Promise<number> {
  const list = await fetchListBySlug(userProfileId, "checkins");
  if (!list.ok || !list.data) {
    return 0;
  }

  const from = offsetDateKey(dateKey, -lookbackDays);
  const { data, error } = await supabase
    .from("magnus_list_items")
    .select("title, extra")
    .eq("user_profile_id", userProfileId)
    .eq("list_id", list.data.id)
    .eq("is_deleted", false)
    .gte("title", from)
    .lt("title", dateKey);

  if (error) {
    return 0;
  }

  const answered = new Set<string>();
  for (const row of data ?? []) {
    const extra = (row.extra as Record<string, unknown> | null) ?? {};
    const has = MORNING_EXTRA_KEYS.some((k) => {
      const v = extra[k];
      return v != null && String(v).trim() !== "";
    });
    if (has && typeof row.title === "string") {
      answered.add(row.title);
    }
  }

  let streak = 0;
  for (let back = 1; back <= lookbackDays; back += 1) {
    if (answered.has(offsetDateKey(dateKey, -back))) {
      break;
    }
    streak += 1;
  }
  return streak;
}

export async function countCheckinsBetween(
  userProfileId: string,
  fromDateKey: string,
  toDateKey: string,
): Promise<number> {
  const list = await fetchListBySlug(userProfileId, "checkins");
  if (!list.ok || !list.data) {
    return 0;
  }

  const { count, error } = await supabase
    .from("magnus_list_items")
    .select("id", { count: "exact", head: true })
    .eq("user_profile_id", userProfileId)
    .eq("list_id", list.data.id)
    .eq("is_deleted", false)
    .gte("title", fromDateKey)
    .lte("title", toDateKey);

  if (error) {
    return 0;
  }
  return count ?? 0;
}

export async function loadJoyScoresBetween(
  userProfileId: string,
  fromDateKey: string,
  toDateKey: string,
): Promise<number[]> {
  const list = await fetchListBySlug(userProfileId, "checkins");
  if (!list.ok || !list.data) {
    return [];
  }

  const { data } = await supabase
    .from("magnus_list_items")
    .select("title, extra")
    .eq("user_profile_id", userProfileId)
    .eq("list_id", list.data.id)
    .eq("is_deleted", false)
    .gte("title", fromDateKey)
    .lte("title", toDateKey)
    .order("title", { ascending: true });

  if (!data?.length) {
    return [];
  }

  const scores: number[] = [];
  for (const row of data) {
    const joy = (row.extra as Record<string, unknown> | null)?.["Joy Score"];
    const n = typeof joy === "number" ? joy : Number(joy);
    if (Number.isFinite(n) && n > 0) {
      scores.push(n);
    }
  }
  return scores;
}
