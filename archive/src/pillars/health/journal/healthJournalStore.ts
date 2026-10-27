import { supabase } from "../../../tools/clients.js";
import { logger } from "../../../logger.js";
import { loggableError } from "../../../util/loggableError.js";

export type HealthJournalRow = {
  log_date: string;
  body: string;
};

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Upsert today's health EOD journal in `magnus_daily_logs`. */
export async function saveHealthJournalEntry(
  userProfileId: string,
  body: string,
  logDate = todayUtcDate(),
): Promise<{ ok: true; logDate: string } | { ok: false; error: string }> {
  const trimmed = body.trim();
  if (!trimmed) {
    return { ok: false, error: "empty journal body" };
  }

  const { data: existing, error: selectError } = await supabase
    .from("magnus_daily_logs")
    .select("id")
    .eq("user_profile_id", userProfileId)
    .eq("log_date", logDate)
    .contains("metadata", { health_journal: true })
    .maybeSingle();

  if (selectError) {
    logger.warn({ err: loggableError(selectError), userProfileId }, "health journal select failed");
    return { ok: false, error: selectError.message };
  }

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("magnus_daily_logs")
      .update({
        body: trimmed,
        source: "telegram",
        metadata: { health_journal: true, updated_via: "telegram" },
      })
      .eq("id", existing.id);

    if (updateError) {
      return { ok: false, error: updateError.message };
    }
    return { ok: true, logDate };
  }

  const { error: insertError } = await supabase.from("magnus_daily_logs").insert({
    user_profile_id: userProfileId,
    log_date: logDate,
    body: trimmed,
    source: "telegram",
    metadata: { health_journal: true, created_via: "telegram" },
  });

  if (insertError) {
    return { ok: false, error: insertError.message };
  }
  return { ok: true, logDate };
}

export async function fetchRecentHealthJournals(
  userProfileId: string,
  limit = 3,
): Promise<HealthJournalRow[]> {
  const { data, error } = await supabase
    .from("magnus_daily_logs")
    .select("log_date, body")
    .eq("user_profile_id", userProfileId)
    .contains("metadata", { health_journal: true })
    .order("log_date", { ascending: false })
    .limit(limit);

  if (error) {
    logger.warn({ err: loggableError(error), userProfileId }, "fetchRecentHealthJournals failed");
    return [];
  }
  return (data ?? []) as HealthJournalRow[];
}
