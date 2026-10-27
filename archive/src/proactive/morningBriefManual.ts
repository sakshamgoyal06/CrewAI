import { runMorningBrief } from "../jobs/morningBrief.js";
import { morningBriefFeatureEnabled } from "../jobs/morningBriefEnv.js";
import { resolveTelegramUserProfile } from "../tools/chatLog.js";

/**
 * Run the morning brief for one Telegram user and deliver to their chat.
 */
export async function runMorningBriefForTelegramUser(
  telegramUserId: string,
  reason: "manual" = "manual",
): Promise<{ ok: true; skipped: boolean; text: string } | { ok: false; error: string }> {
  if (!morningBriefFeatureEnabled()) {
    return { ok: false, error: "Morning Brief is disabled on this host." };
  }

  const user = await resolveTelegramUserProfile(telegramUserId);
  if (!user.allowlisted) {
    return { ok: false, error: "You're not allowlisted to use Magnus yet." };
  }

  const result = await runMorningBrief({
    userProfileId: user.profileId,
    telegramUserId: user.telegramUserId,
    chatId: user.telegramUserId,
    now: new Date(),
    reason,
    deliverTelegram: true,
  });

  return { ok: true, skipped: result.skipped, text: result.text };
}

/** Plain-language or legacy slash trigger for an on-demand morning brief. */
export function isMorningBriefTrigger(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) {
    return false;
  }
  if (t === "/morningbrief" || t.startsWith("/morningbrief@")) {
    return true;
  }
  if (t === "morning brief" || t === "morningbrief") {
    return true;
  }
  if (t === "send morning brief" || t === "run morning brief") {
    return true;
  }
  return false;
}
