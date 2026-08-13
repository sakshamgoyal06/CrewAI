import { fetchCheckinItem, fetchListBySlug } from "../../lists/listStore.js";
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
