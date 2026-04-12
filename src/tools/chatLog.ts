/**
 * User identity model (Supabase):
 * - **Canonical user id:** `user_profile.id` (uuid). Domain tables use FK `user_profile_id` → `user_profile(id)`.
 * - **Telegram id:** `user_profile.telegram_chat_id` (unique when set) — Telegram user id as string.
 * - **Chat logs:** `magnus_chat_messages` stores both `user_profile_id` and denormalized `telegram_user_id` for filtering.
 */
import { logger, maskTelegramUserId } from "../logger.js";
import { loggableError } from "../util/loggableError.js";
import { supabase } from "./clients.js";

const DEFAULT_PROFILE = {
  north_star_goal:
    "Build my company, be fit, grow wealth, live intentionally",
  timezone: "Asia/Kolkata",
};

/** Placeholder tiers — tighten rules in code as the product grows. */
export const USER_TIERS = ["standard", "premium", "internal"] as const;
export type UserTier = (typeof USER_TIERS)[number];

export type TelegramUserProfile = {
  profileId: string;
  telegramUserId: string;
  allowlisted: boolean;
  userTier: string;
  accessFlags: Record<string, unknown>;
  /** From `user_profile.timezone` when selected. */
  timezone?: string;
  /** From `user_profile.north_star_goal` when present. */
  northStarGoal?: string;
};

function normalizeTelegramUserId(telegramUserId: string): string {
  const t = telegramUserId.trim();
  if (!t) {
    throw new Error("telegramUserId is required");
  }
  return t;
}

function defaultsForNewProfile(): {
  allowlisted: boolean;
  userTier: string;
  accessFlags: Record<string, unknown>;
} {
  const auto = process.env.MAGNUS_AUTO_ALLOWLIST_NEW_USERS?.trim().toLowerCase();
  const allowlisted = auto === "true";
  const tierRaw = process.env.MAGNUS_DEFAULT_USER_TIER?.trim() || "standard";
  const userTier = USER_TIERS.includes(tierRaw as UserTier)
    ? tierRaw
    : "standard";
  return {
    allowlisted,
    userTier,
    accessFlags: {
      chat: true,
      agents: false,
      deep_memory: false,
    },
  };
}

function rowToProfile(
  row: {
    id: string;
    allowlisted: boolean;
    user_tier: string;
    access_flags: unknown;
    timezone?: string | null;
    north_star_goal?: string | null;
  },
  telegramUserId: string,
): TelegramUserProfile {
  const flags =
    row.access_flags &&
    typeof row.access_flags === "object" &&
    !Array.isArray(row.access_flags)
      ? (row.access_flags as Record<string, unknown>)
      : {};
  return {
    profileId: row.id,
    telegramUserId,
    allowlisted: row.allowlisted,
    userTier: row.user_tier,
    accessFlags: flags,
    timezone: row.timezone ?? undefined,
    northStarGoal: row.north_star_goal?.trim() || undefined,
  };
}

/**
 * Resolves or creates `user_profile` for this Telegram user (`ctx.from.id` as string).
 * Reuses legacy single row with NULL telegram_chat_id when exactly one such row exists.
 */
export async function resolveTelegramUserProfile(
  telegramUserId: string,
): Promise<TelegramUserProfile> {
  const tid = normalizeTelegramUserId(telegramUserId);

  const { data: existing, error: selErr } = await supabase
    .from("user_profile")
    .select("id, allowlisted, user_tier, access_flags, timezone, north_star_goal")
    .eq("telegram_chat_id", tid)
    .maybeSingle();

  if (selErr) {
    throw selErr;
  }
  if (existing?.id) {
    return rowToProfile(
      {
        id: existing.id,
        allowlisted: existing.allowlisted,
        user_tier: existing.user_tier,
        access_flags: existing.access_flags,
        timezone: existing.timezone as string | null | undefined,
        north_star_goal: existing.north_star_goal as string | null | undefined,
      },
      tid,
    );
  }

  const { count: orphanCount, error: countErr } = await supabase
    .from("user_profile")
    .select("id", { count: "exact", head: true })
    .is("telegram_chat_id", null);

  if (countErr) {
    throw countErr;
  }

  if (orphanCount === 1) {
    const { data: orphan, error: orphanSelErr } = await supabase
      .from("user_profile")
      .select("id, allowlisted, user_tier, access_flags, timezone, north_star_goal")
      .is("telegram_chat_id", null)
      .single();

    if (orphanSelErr) {
      throw orphanSelErr;
    }

    const { data: adopted, error: upErr } = await supabase
      .from("user_profile")
      .update({ telegram_chat_id: tid })
      .eq("id", orphan.id)
      .select("id, allowlisted, user_tier, access_flags, timezone, north_star_goal")
      .single();

    if (upErr) {
      throw upErr;
    }
    return rowToProfile(adopted, tid);
  }

  const seed = defaultsForNewProfile();
  const { data: created, error: insErr } = await supabase
    .from("user_profile")
    .insert({
      ...DEFAULT_PROFILE,
      telegram_chat_id: tid,
      allowlisted: seed.allowlisted,
      user_tier: seed.userTier,
      access_flags: seed.accessFlags,
    })
    .select("id, allowlisted, user_tier, access_flags, timezone, north_star_goal")
    .single();

  if (insErr) {
    if (insErr.code === "23505") {
      const { data: row, error: again } = await supabase
        .from("user_profile")
        .select("id, allowlisted, user_tier, access_flags, timezone, north_star_goal")
        .eq("telegram_chat_id", tid)
        .single();
      if (again || !row) {
        throw again ?? new Error("profile missing after unique conflict");
      }
      return rowToProfile(row, tid);
    }
    throw insErr;
  }

  return rowToProfile(created, tid);
}

/** @deprecated Use resolveTelegramUserProfile; kept for narrow call sites. */
export async function ensureUserProfileIdForTelegramUser(
  telegramUserId: string,
): Promise<string> {
  const p = await resolveTelegramUserProfile(telegramUserId);
  return p.profileId;
}

export type DisambiguationAssistantRow = {
  originalUserMessage: string;
  createdAt: string;
};

/**
 * Most recent assistant row from a planning/research disambiguation prompt (follow-up "1"/"2").
 */
export async function fetchLastDisambiguationAssistant(
  userProfileId: string,
): Promise<DisambiguationAssistantRow | null> {
  const { data, error } = await supabase
    .from("magnus_chat_messages")
    .select("metadata, created_at")
    .eq("user_profile_id", userProfileId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    logger.error(
      { err: loggableError(error), userProfileId },
      "fetchLastDisambiguationAssistant failed",
    );
    return null;
  }

  const row = data?.[0];
  if (!row) {
    return null;
  }
  const meta = row.metadata;
  if (
    meta &&
    typeof meta === "object" &&
    !Array.isArray(meta) &&
    (meta as Record<string, unknown>).disambiguation === true
  ) {
    const original = (meta as Record<string, unknown>).original_user_message;
    if (typeof original === "string" && original.trim().length > 0) {
      return {
        originalUserMessage: original.trim(),
        createdAt: row.created_at as string,
      };
    }
  }
  return null;
}

export async function recordMagnusChatMessage(input: {
  user_profile_id: string;
  telegram_user_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  source?: string;
  intent?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("magnus_chat_messages").insert({
    user_profile_id: input.user_profile_id,
    telegram_user_id: input.telegram_user_id,
    role: input.role,
    content: input.content,
    source: input.source ?? "telegram",
    intent: input.intent ?? null,
    metadata: input.metadata ?? null,
  });

  if (error) {
    logger.error(
      {
        err: loggableError(error),
        role: input.role,
        telegramUserId: maskTelegramUserId(input.telegram_user_id),
      },
      "magnus_chat_messages insert failed",
    );
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
