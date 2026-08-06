import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase as defaultClient } from "../../tools/clients.js";
import {
  CATALOG_KINDS,
  DEFAULT_CATALOG_CAP,
  DEFAULT_CATALOG_COOLDOWN_HOURS,
  DEFAULT_CATALOG_SCHEDULE,
  DEFAULT_CATALOG_TRIGGER,
  isCatalogKind,
  rowToSubscription,
  type ProactiveCapBucket,
  type ProactiveSchedule,
  type ProactiveSubscription,
  type ProactiveSubscriptionRow,
  type ProactiveTriggerType,
} from "./types.js";

const TABLE = "magnus_proactive_subscriptions";

export type StoreResult<T> = { ok: true; data: T } | { ok: false; error: string };

function client(deps?: { client?: SupabaseClient }): SupabaseClient {
  return deps?.client ?? defaultClient;
}

export async function listEnabledSubscriptions(
  userProfileId: string,
  deps?: { client?: SupabaseClient },
): Promise<ProactiveSubscription[]> {
  const { data, error } = await client(deps)
    .from(TABLE)
    .select("*")
    .eq("user_profile_id", userProfileId)
    .eq("enabled", true)
    .order("created_at", { ascending: true });

  if (error || !data) {
    return [];
  }
  return (data as ProactiveSubscriptionRow[]).map(rowToSubscription);
}

export async function listAllSubscriptions(
  userProfileId: string,
  deps?: { client?: SupabaseClient },
): Promise<ProactiveSubscription[]> {
  const { data, error } = await client(deps)
    .from(TABLE)
    .select("*")
    .eq("user_profile_id", userProfileId)
    .order("created_at", { ascending: true });

  if (error || !data) {
    return [];
  }
  return (data as ProactiveSubscriptionRow[]).map(rowToSubscription);
}

export async function getSubscriptionByKind(
  userProfileId: string,
  kind: string,
  deps?: { client?: SupabaseClient },
): Promise<ProactiveSubscription | null> {
  const { data, error } = await client(deps)
    .from(TABLE)
    .select("*")
    .eq("user_profile_id", userProfileId)
    .eq("kind", kind)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  return rowToSubscription(data as ProactiveSubscriptionRow);
}

export async function upsertCatalogSubscription(input: {
  userProfileId: string;
  kind: string;
  enabled: boolean;
  schedule?: ProactiveSchedule;
  userInstruction?: string;
  source?: "system_default" | "user_chat";
  deps?: { client?: SupabaseClient };
}): Promise<StoreResult<ProactiveSubscription>> {
  if (!isCatalogKind(input.kind)) {
    return { ok: false, error: `Unknown catalog kind "${input.kind}".` };
  }

  const kind = input.kind;
  const schedule = input.schedule ?? DEFAULT_CATALOG_SCHEDULE[kind];
  const existing = await getSubscriptionByKind(input.userProfileId, kind, input.deps);
  const row = {
    user_profile_id: input.userProfileId,
    kind,
    enabled: input.enabled,
    trigger_type: DEFAULT_CATALOG_TRIGGER[kind],
    schedule,
    config: {},
    user_instruction: input.userInstruction?.trim() || null,
    source: input.source ?? "user_chat",
    cap_bucket: DEFAULT_CATALOG_CAP[kind],
    cooldown_hours: DEFAULT_CATALOG_COOLDOWN_HOURS[kind] ?? null,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { data, error } = await client(input.deps)
      .from(TABLE)
      .update(row)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error || !data) {
      return { ok: false, error: error?.message ?? "update failed" };
    }
    return { ok: true, data: rowToSubscription(data as ProactiveSubscriptionRow) };
  }

  const { data, error } = await client(input.deps).from(TABLE).insert(row).select("*").single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "upsert failed" };
  }
  return { ok: true, data: rowToSubscription(data as ProactiveSubscriptionRow) };
}

export async function createCustomReminder(input: {
  userProfileId: string;
  message: string;
  at: Date;
  deps?: { client?: SupabaseClient };
}): Promise<StoreResult<ProactiveSubscription>> {
  const now = new Date().toISOString();
  const row = {
    user_profile_id: input.userProfileId,
    kind: "custom_reminder",
    enabled: true,
    trigger_type: "one_shot" as ProactiveTriggerType,
    schedule: { type: "one_shot", at: input.at.toISOString() } satisfies ProactiveSchedule,
    config: { message: input.message.trim() },
    user_instruction: input.message.trim(),
    source: "user_chat" as const,
    cap_bucket: "user_asked" as ProactiveCapBucket,
    next_fire_at: input.at.toISOString(),
    updated_at: now,
  };

  const { data, error } = await client(input.deps).from(TABLE).insert(row).select("*").single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "insert failed" };
  }
  return { ok: true, data: rowToSubscription(data as ProactiveSubscriptionRow) };
}

export async function createRecurringCustomReminder(input: {
  userProfileId: string;
  message: string;
  localHour: number;
  windowMinutes?: number;
  deps?: { client?: SupabaseClient };
}): Promise<StoreResult<ProactiveSubscription>> {
  const hour = Math.min(23, Math.max(0, Math.floor(input.localHour)));
  const row = {
    user_profile_id: input.userProfileId,
    kind: "custom_reminder",
    enabled: true,
    trigger_type: "recurring" as ProactiveTriggerType,
    schedule: {
      type: "recurring_local",
      localHour: hour,
      windowMinutes: input.windowMinutes ?? 14,
    } satisfies ProactiveSchedule,
    config: { message: input.message.trim(), recurring: true },
    user_instruction: input.message.trim(),
    source: "user_chat" as const,
    cap_bucket: "user_asked" as ProactiveCapBucket,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client(input.deps).from(TABLE).insert(row).select("*").single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "insert failed" };
  }
  return { ok: true, data: rowToSubscription(data as ProactiveSubscriptionRow) };
}

export async function disableAllSubscriptions(
  userProfileId: string,
  opts?: { catalogOnly?: boolean; deps?: { client?: SupabaseClient } },
): Promise<StoreResult<{ count: number }>> {
  let q = client(opts?.deps)
    .from(TABLE)
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq("user_profile_id", userProfileId)
    .eq("enabled", true);

  if (opts?.catalogOnly) {
    q = q.in("kind", [...CATALOG_KINDS]);
  }

  const { data, error } = await q.select("id");
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, data: { count: data?.length ?? 0 } };
}

export async function setSubscriptionEnabled(
  input: {
    userProfileId: string;
    subscriptionId?: string;
    kind?: string;
    enabled: boolean;
  },
  deps?: { client?: SupabaseClient },
): Promise<StoreResult<ProactiveSubscription>> {
  let q = client(deps).from(TABLE).update({
    enabled: input.enabled,
    updated_at: new Date().toISOString(),
  });

  if (input.subscriptionId) {
    q = q.eq("id", input.subscriptionId).eq("user_profile_id", input.userProfileId);
  } else if (input.kind) {
    q = q.eq("kind", input.kind).eq("user_profile_id", input.userProfileId);
  } else {
    return { ok: false, error: "subscription_id or kind is required." };
  }

  const { data, error } = await q.select("*").maybeSingle();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "subscription not found" };
  }
  return { ok: true, data: rowToSubscription(data as ProactiveSubscriptionRow) };
}

export async function deleteSubscription(
  userProfileId: string,
  subscriptionId: string,
  deps?: { client?: SupabaseClient },
): Promise<StoreResult<{ deleted: boolean }>> {
  const { error, count } = await client(deps)
    .from(TABLE)
    .delete({ count: "exact" })
    .eq("id", subscriptionId)
    .eq("user_profile_id", userProfileId);

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, data: { deleted: (count ?? 0) > 0 } };
}

export async function markSubscriptionSent(
  subscriptionId: string,
  sentAt: Date,
  opts?: { disable?: boolean; deps?: { client?: SupabaseClient } },
): Promise<void> {
  const patch: Record<string, unknown> = {
    last_sent_at: sentAt.toISOString(),
    updated_at: sentAt.toISOString(),
  };
  if (opts?.disable) {
    patch.enabled = false;
    patch.next_fire_at = null;
  }

  await client(opts?.deps).from(TABLE).update(patch).eq("id", subscriptionId);
}

export async function listDueCustomReminders(
  now: Date,
  deps?: { client?: SupabaseClient },
): Promise<ProactiveSubscription[]> {
  const { data, error } = await client(deps)
    .from(TABLE)
    .select("*")
    .eq("enabled", true)
    .eq("kind", "custom_reminder")
    .eq("trigger_type", "one_shot")
    .not("next_fire_at", "is", null)
    .lte("next_fire_at", now.toISOString())
    .limit(100);

  if (error || !data) {
    return [];
  }
  return (data as ProactiveSubscriptionRow[]).map(rowToSubscription);
}
