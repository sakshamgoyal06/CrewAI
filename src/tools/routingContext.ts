/**
 * Fetch recent chat turns for routing decisions (intent coercion, tool continuations).
 */
import { supabase } from "../tools/clients.js";
import type { RoutingChatTurn } from "../agents/routing/magnusToolContinuation.js";

export async function fetchRecentRoutingTurns(
  userProfileId: string,
  telegramUserId: string,
  limit = 6,
): Promise<RoutingChatTurn[]> {
  const { data, error } = await supabase
    .from("magnus_chat_messages")
    .select("role, content, metadata")
    .eq("user_profile_id", userProfileId)
    .eq("telegram_user_id", telegramUserId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data?.length) {
    return [];
  }

  return data
    .map((row) => ({
      role: String(row.role ?? ""),
      content: typeof row.content === "string" ? row.content : "",
      metadata:
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : null,
    }))
    .reverse();
}
