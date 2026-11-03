/**
 * Per-user third-party credentials. Only Hevy is live; the table's other columns (Notion, Kite,
 * Google, YouTube) are from the archived Telegram assistant. The key is stored sealed with
 * `MAGNUS_SECRETS_KEY` when that is set (see util/secretBox.ts).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "../logger.js";
import { supabase as defaultClient } from "../tools/clients.js";
import { open, seal } from "../util/secretBox.js";

export type UserIntegrations = {
  hevyApiKey?: string;
};

export async function loadUserIntegrations(
  userProfileId: string | undefined,
  client: SupabaseClient = defaultClient,
): Promise<UserIntegrations> {
  if (!userProfileId?.trim()) return {};
  const { data, error } = await client
    .from("user_integrations")
    .select("hevy_api_key")
    .eq("user_profile_id", userProfileId)
    .maybeSingle();
  if (error || !data) return {};
  const stored = typeof data.hevy_api_key === "string" ? data.hevy_api_key.trim() : "";
  if (!stored) return {};
  const key = open(stored);
  if (key === null) logger.warn({ userProfileId }, "stored Hevy key can't be decrypted (MAGNUS_SECRETS_KEY missing or changed)");
  return key ? { hevyApiKey: key } : {};
}

/** Saves (or with "" clears) the Hevy key. Omitted fields are left alone. */
export async function upsertUserIntegrations(
  input: { userProfileId: string } & UserIntegrations,
  client: SupabaseClient = defaultClient,
): Promise<{ ok: boolean; error?: string }> {
  const row: Record<string, unknown> = { user_profile_id: input.userProfileId, updated_at: new Date().toISOString() };
  if (input.hevyApiKey !== undefined) row.hevy_api_key = input.hevyApiKey ? seal(input.hevyApiKey) : null;
  const { error } = await client.from("user_integrations").upsert(row, { onConflict: "user_profile_id" });
  return error ? { ok: false, error: error.message } : { ok: true };
}
