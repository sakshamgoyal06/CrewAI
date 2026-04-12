/**
 * Manual trigger: `/morningbrief` or plain "morning brief" (handled in telegram.ts).
 */
import { resolveTelegramUserProfile } from "../tools/chatLog.js";
import { runMorningBrief } from "./morningBrief.js";

const NOT_ALLOWLISTED_REPLY =
  "You're not allowlisted to use Magnus yet. Ask an admin to enable your account.";

export type MorningBriefManualResult =
  | { ok: true; ack: string }
  | { ok: false; reply: string };

export async function runMorningBriefForTelegramUser(
  telegramUserId: string,
  now: Date,
): Promise<MorningBriefManualResult> {
  const user = await resolveTelegramUserProfile(telegramUserId);
  if (!user.allowlisted) {
    return { ok: false, reply: NOT_ALLOWLISTED_REPLY };
  }

  const { sendMessage } = await import("../tools/telegram.js");
  const result = await runMorningBrief(
    {
      userProfileId: user.profileId,
      telegramUserId: user.telegramUserId,
      chatId: user.telegramUserId,
      now,
      reason: "manual",
    },
    { sendTelegram: sendMessage },
  );

  if (result.skipped) {
    return {
      ok: false,
      reply: "Morning brief is turned off (MAGNUS_MORNING_BRIEF_ENABLED=false).",
    };
  }

  return { ok: true, ack: "Morning brief sent." };
}
