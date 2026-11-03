/**
 * What a person already used today, read back from the database: chat turns from the chat
 * table, everything else from the server's own route log. Loaded once per person, action and
 * day, so in-memory caps survive a redeploy.
 */
import { logger } from "../logger.js";
import { supabase } from "../tools/clients.js";
import { loggableError } from "../util/loggableError.js";
import type { LimitedAction } from "./usageLimits.js";

/** The served route each capped action is logged under (health_app_events, kind server_route). */
export const ROUTE_OF: Record<Exclude<LimitedAction, "chat">, string> = {
  photo: "POST /meals/photo",
  rca: "POST /rca",
  draft: "POST /meals/draft",
};

export async function usedSince(userProfileId: string, action: LimitedAction, fromIso: string): Promise<number> {
  try {
    if (action === "chat") {
      const { count, error } = await supabase
        .from("health_chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_profile_id", userProfileId)
        .eq("role", "user")
        .gte("created_at", fromIso);
      if (error) throw new Error(error.message);
      return count ?? 0;
    }
    const { count, error } = await supabase
      .from("health_app_events")
      .select("id", { count: "exact", head: true })
      .eq("user_profile_id", userProfileId)
      .eq("kind", "server_route")
      .eq("name", ROUTE_OF[action])
      .lt("status", 400)
      .gte("occurred_at", fromIso);
    if (error) throw new Error(error.message);
    return count ?? 0;
  } catch (err) {
    // A failed read must not block anyone: start from zero as before.
    logger.warn({ err: loggableError(err), action }, "usage seed read failed");
    return 0;
  }
}
