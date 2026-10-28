/**
 * Chat inactivity signals for proactive nudges.
 */
import { supabase } from "../../tools/clients.js";

export type ChatInactivitySnapshot = {
  lastUserMessageAt: Date | null;
  daysSinceLastMessage: number | null;
  hoursSinceLastMessage: number | null;
};

export async function loadChatInactivitySnapshot(input: {
  userProfileId: string;
  telegramChatId: string;
  now: Date;
}): Promise<ChatInactivitySnapshot> {
  const { data } = await supabase
    .from("magnus_chat_messages")
    .select("created_at")
    .eq("user_profile_id", input.userProfileId)
    .eq("telegram_user_id", input.telegramChatId)
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.created_at) {
    return {
      lastUserMessageAt: null,
      daysSinceLastMessage: null,
      hoursSinceLastMessage: null,
    };
  }

  const last = new Date(String(data.created_at));
  if (Number.isNaN(last.getTime())) {
    return {
      lastUserMessageAt: null,
      daysSinceLastMessage: null,
      hoursSinceLastMessage: null,
    };
  }

  const ms = input.now.getTime() - last.getTime();
  return {
    lastUserMessageAt: last,
    daysSinceLastMessage: Math.floor(ms / (24 * 60 * 60 * 1000)),
    hoursSinceLastMessage: Math.floor(ms / (60 * 60 * 1000)),
  };
}
