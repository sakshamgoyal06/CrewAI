/**
 * Supabase mirror for LifeOS daily logging — pairs with Notion human-readable surface.
 * @see magnus.md — `magnus_daily_logs`
 */
import { logger } from "../logger.js";
import { loggableError } from "../util/loggableError.js";
import { supabase } from "./clients.js";

export type MagnusDailyLogSource = "telegram" | "notion" | "system";

export type RecordMagnusDailyLogInput = {
  userProfileId: string;
  /** Calendar day (YYYY-MM-DD), typically user timezone. */
  logDate: string;
  body: string;
  source: MagnusDailyLogSource;
  notionPageId?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Inserts a row into `magnus_daily_logs`. Best-effort: failures are logged, not thrown.
 */
export async function recordMagnusDailyLog(
  input: RecordMagnusDailyLogInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const body = input.body.trim().slice(0, 8000);
  if (!body) {
    return { ok: false, error: "empty body" };
  }

  const { data, error } = await supabase
    .from("magnus_daily_logs")
    .insert({
      user_profile_id: input.userProfileId,
      log_date: input.logDate,
      body,
      source: input.source,
      notion_page_id: input.notionPageId ?? null,
      metadata: input.metadata ?? null,
    })
    .select("id")
    .single();

  if (error) {
    logger.warn(
      { err: loggableError(error), userProfileId: input.userProfileId, source: input.source },
      "magnus_daily_logs insert failed",
    );
    return { ok: false, error: error.message };
  }

  return { ok: true, id: typeof data?.id === "string" ? data.id : undefined };
}
