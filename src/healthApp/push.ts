/**
 * Web Push for the health app: the PWA subscribes with the server's VAPID public key, and the
 * proactive scheduler sends through every subscription. Each notification has a dedupe key, so
 * a restart or a second tick never sends the same nudge twice.
 */
import { createECDH } from "node:crypto";
import webpush from "web-push";
import { z } from "zod";

import { logger } from "../logger.js";
import { supabase } from "../tools/clients.js";
import { loggableError } from "../util/loggableError.js";

export type PushConfig = { publicKey: string; privateKey: string; subject: string };

/** The VAPID public key that belongs to a private key (both base64url, P-256), or "" if it isn't one. */
export function vapidPublicKeyOf(privateKey: string): string {
  try {
    const raw = Buffer.from(privateKey, "base64url");
    if (raw.length !== 32) return "";
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(raw);
    return ecdh.getPublicKey().toString("base64url");
  } catch {
    return "";
  }
}

export function pushConfig(): PushConfig | null {
  const privateKey = process.env.MAGNUS_VAPID_PRIVATE_KEY?.trim() || "";
  // The public half follows from the private key, so only the private key has to be set.
  const publicKey = process.env.MAGNUS_VAPID_PUBLIC_KEY?.trim() || (privateKey ? vapidPublicKeyOf(privateKey) : "");
  const subject = process.env.MAGNUS_VAPID_SUBJECT?.trim() || "mailto:magnus@example.com";
  return publicKey && privateKey ? { publicKey, privateKey, subject } : null;
}

export const subscriptionInput = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(300), auth: z.string().min(4).max(100) }),
});

export const NOTIFICATION_KINDS = [
  "morning_plan",
  "meal_reminder",
  "step_pace",
  "workout_check",
  "evening_wrap",
  "weigh_in",
  "rca",
  "routine_reminder",
  "routine_check",
  "intervention",
  "plan_meal",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const prefsInput = z.object({
  quietStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  quietEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  off: z.array(z.enum(NOTIFICATION_KINDS)).max(NOTIFICATION_KINDS.length).optional(),
});

export type NotificationPrefs = { quietStart: string; quietEnd: string; off: NotificationKind[] };
export const DEFAULT_PREFS: NotificationPrefs = { quietStart: "22:30", quietEnd: "07:00", off: [] };

export function parsePrefs(raw: unknown): NotificationPrefs {
  const p = prefsInput.safeParse(raw ?? {});
  return { ...DEFAULT_PREFS, ...(p.success ? p.data : {}) } as NotificationPrefs;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
};

/** True when local `hhmm` falls in the quiet window (which may wrap past midnight). */
export function isQuiet(hhmm: string, prefs: NotificationPrefs): boolean {
  const t = toMin(hhmm);
  const s = toMin(prefs.quietStart);
  const e = toMin(prefs.quietEnd);
  if (s === e) return false;
  return s < e ? t >= s && t < e : t >= s || t < e;
}

export type Notification = {
  kind: NotificationKind;
  /** Unique per user, e.g. "meal_reminder:lunch:2026-11-01". */
  dedupeKey: string;
  title: string;
  body: string;
  /** In-app link opened on tap, e.g. "/app/#coach". */
  url?: string;
};

// ---------- store ----------

export async function getPrefs(userProfileId: string): Promise<NotificationPrefs> {
  const { data } = await supabase
    .from("user_health_profile")
    .select("notification_prefs")
    .eq("user_profile_id", userProfileId)
    .maybeSingle();
  return parsePrefs((data as { notification_prefs?: unknown } | null)?.notification_prefs);
}

export async function savePrefs(
  userProfileId: string,
  input: z.infer<typeof prefsInput>,
): Promise<{ ok: boolean; error?: string; prefs?: NotificationPrefs }> {
  const prefs = { ...(await getPrefs(userProfileId)), ...input };
  const { error } = await supabase
    .from("user_health_profile")
    .upsert({ user_profile_id: userProfileId, notification_prefs: prefs }, { onConflict: "user_profile_id" });
  return error ? { ok: false, error: error.message } : { ok: true, prefs };
}

export async function saveSubscription(
  userProfileId: string,
  sub: z.infer<typeof subscriptionInput>,
  userAgent: string | undefined,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("health_push_subscriptions").upsert(
    {
      user_profile_id: userProfileId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_agent: userAgent?.slice(0, 300) ?? null,
      failures: 0,
    },
    { onConflict: "endpoint" },
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteSubscription(userProfileId: string, endpoint: string): Promise<{ ok: boolean }> {
  await supabase.from("health_push_subscriptions").delete().eq("user_profile_id", userProfileId).eq("endpoint", endpoint);
  return { ok: true };
}

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string; failures: number };

async function listSubscriptions(userProfileId: string): Promise<SubRow[]> {
  const { data } = await supabase
    .from("health_push_subscriptions")
    .select("id, endpoint, p256dh, auth, failures")
    .eq("user_profile_id", userProfileId);
  return (data ?? []) as SubRow[];
}

/** Claims the dedupe key. False when this notification was already sent. */
async function claimNotification(userProfileId: string, n: Notification): Promise<string | null> {
  const { data, error } = await supabase
    .from("health_notifications")
    .upsert(
      { user_profile_id: userProfileId, kind: n.kind, dedupe_key: n.dedupeKey, title: n.title, body: n.body, url: n.url ?? null },
      { onConflict: "user_profile_id,dedupe_key", ignoreDuplicates: true },
    )
    .select("id");
  if (error) {
    logger.warn({ error: error.message }, "notification claim failed");
    return null;
  }
  return (data as Array<{ id: string }> | null)?.[0]?.id ?? null;
}

// ---------- send ----------

type SendFn = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<void>;

function webPushSender(cfg: PushConfig): SendFn {
  webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
  return async (sub, payload) => {
    await webpush.sendNotification(sub, payload, { TTL: 6 * 3600, urgency: "normal" });
  };
}

/**
 * Sends once per dedupe key to every device. Gone subscriptions (404/410) are removed; others
 * are dropped after five failures in a row. Returns how many devices accepted it.
 */
export async function sendNotification(
  userProfileId: string,
  n: Notification,
  send: SendFn | null = null,
): Promise<{ sent: boolean; delivered: number; reason?: string }> {
  const cfg = pushConfig();
  const sender = send ?? (cfg ? webPushSender(cfg) : null);
  if (!sender) return { sent: false, delivered: 0, reason: "push_not_configured" };
  const subs = await listSubscriptions(userProfileId);
  if (!subs.length) return { sent: false, delivered: 0, reason: "no_devices" };
  const id = await claimNotification(userProfileId, n);
  if (!id) return { sent: false, delivered: 0, reason: "duplicate" };

  const payload = JSON.stringify({ title: n.title, body: n.body, url: n.url ?? "/app/", tag: n.kind });
  let delivered = 0;
  for (const s of subs) {
    try {
      await sender({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      delivered += 1;
      await supabase
        .from("health_push_subscriptions")
        .update({ last_success_at: new Date().toISOString(), failures: 0 })
        .eq("id", s.id);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410 || s.failures >= 4) {
        await supabase.from("health_push_subscriptions").delete().eq("id", s.id);
      } else {
        await supabase.from("health_push_subscriptions").update({ failures: s.failures + 1 }).eq("id", s.id);
      }
      logger.warn({ err: loggableError(err), status }, "push send failed");
    }
  }
  await supabase.from("health_notifications").update({ delivered }).eq("id", id);
  return { sent: delivered > 0, delivered };
}

export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  return webpush.generateVAPIDKeys();
}
