import { supabase } from "../tools/clients.js";

export type ProactiveTarget = {
  userProfileId: string;
  telegramChatId: string;
  timezone: string;
};

/** Allowlisted users with a Telegram chat id for outbound sends. */
export async function listAllowlistedTelegramTargets(): Promise<ProactiveTarget[]> {
  const { data, error } = await supabase
    .from("user_profile")
    .select("id, telegram_chat_id, timezone")
    .eq("allowlisted", true)
    .not("telegram_chat_id", "is", null);

  if (error) {
    throw new Error(error.message);
  }

  const out: ProactiveTarget[] = [];
  for (const row of data ?? []) {
    const tid = row.telegram_chat_id as string;
    if (!tid?.trim()) {
      continue;
    }
    const tz =
      (typeof row.timezone === "string" && row.timezone.trim()) || "UTC";
    out.push({
      userProfileId: row.id as string,
      telegramChatId: tid.trim(),
      timezone: tz,
    });
  }
  return out;
}
