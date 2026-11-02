/**
 * Magnus Pro: a 7-day free trial from sign-up (no card), then Pro by subscription or the free
 * plan with a small daily AI allowance. Razorpay sells it on the web and in the sideloaded app;
 * Play Billing slots into the same user_subscriptions row once the app is on the Play Store.
 *
 * Nothing is enforced until MAGNUS_BILLING=on, so the deploy keeps working before the Razorpay
 * account and plans exist.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { logger } from "../logger.js";
import { supabase } from "../tools/clients.js";
import { healthAppAuthConfig } from "./auth.js";
import type { LimitedAction } from "./usageLimits.js";

export const TRIAL_DAYS = 7;
const DAY_MS = 86_400_000;

export type Tier = "pro" | "trial" | "free";
export type PlanId = "monthly" | "yearly";
export type SubscriptionStatus = "pending" | "active" | "past_due" | "cancelled" | "expired";

export type SubscriptionRow = {
  provider: "razorpay" | "play" | "manual";
  provider_subscription_id: string | null;
  plan: PlanId;
  status: SubscriptionStatus;
  current_period_end: string | null;
};

export type Entitlement = {
  tier: Tier;
  trialEndsAt: string | null;
  /** End of the paid period (renews unless cancelled). */
  periodEndsAt: string | null;
  status: SubscriptionStatus | null;
  plan: PlanId | null;
  provider: SubscriptionRow["provider"] | null;
};

export function billingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MAGNUS_BILLING?.trim().toLowerCase() === "on";
}

/** A grace period on failed renewals: past_due keeps Pro this long after the period ends. */
const GRACE_MS = 3 * DAY_MS;

export function entitlementFrom(input: {
  createdAt: string | null;
  sub: SubscriptionRow | null;
  isOwner: boolean;
  now: Date;
}): Entitlement {
  const { sub, now } = input;
  const base = {
    trialEndsAt: input.createdAt ? new Date(Date.parse(input.createdAt) + TRIAL_DAYS * DAY_MS).toISOString() : null,
    periodEndsAt: sub?.current_period_end ?? null,
    status: sub?.status ?? null,
    plan: sub?.plan ?? null,
    provider: sub?.provider ?? null,
  };
  if (input.isOwner) return { tier: "pro", ...base };
  if (sub && sub.current_period_end) {
    const end = Date.parse(sub.current_period_end);
    const paid =
      ((sub.status === "active" || sub.status === "cancelled") && end > now.getTime()) ||
      (sub.status === "past_due" && end + GRACE_MS > now.getTime());
    if (paid) return { tier: "pro", ...base };
  }
  if (base.trialEndsAt && Date.parse(base.trialEndsAt) > now.getTime()) return { tier: "trial", ...base };
  return { tier: "free", ...base };
}

/** The free plan's daily allowance; Pro and the trial use the normal caps (undefined). */
export function limitFor(tier: Tier, action: LimitedAction, env: NodeJS.ProcessEnv = process.env): number | undefined {
  if (!billingEnabled(env) || tier !== "free") return undefined;
  const raw = env[action === "chat" ? "MAGNUS_FREE_CHAT_LIMIT" : "MAGNUS_FREE_PHOTO_LIMIT"]?.trim();
  const n = raw ? Number.parseInt(raw, 10) : action === "chat" ? 5 : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

const cache = new Map<string, { at: number; ent: Entitlement }>();
const CACHE_MS = 60_000;

export function forgetEntitlement(userProfileId: string): void {
  cache.delete(userProfileId);
}

export async function loadEntitlement(userProfileId: string, now = new Date()): Promise<Entitlement> {
  const hit = cache.get(userProfileId);
  if (hit && now.getTime() - hit.at < CACHE_MS) return hit.ent;
  const [profile, sub] = await Promise.all([
    supabase.from("user_profile").select("created_at").eq("id", userProfileId).maybeSingle(),
    supabase
      .from("user_subscriptions")
      .select("provider, provider_subscription_id, plan, status, current_period_end")
      .eq("user_profile_id", userProfileId)
      .maybeSingle(),
  ]);
  if (sub.error) logger.warn({ err: sub.error.message }, "subscription read failed");
  const ent = entitlementFrom({
    createdAt: (profile.data as { created_at?: string } | null)?.created_at ?? null,
    sub: sub.error ? null : ((sub.data as SubscriptionRow | null) ?? null),
    isOwner: healthAppAuthConfig()?.userProfileId === userProfileId,
    now,
  });
  cache.set(userProfileId, { at: now.getTime(), ent });
  return ent;
}

// ---------- Razorpay ----------

export type RazorpayConfig = {
  keyId: string;
  keySecret: string;
  webhookSecret: string | null;
  plans: Record<PlanId, string>;
};

export function razorpayConfig(env: NodeJS.ProcessEnv = process.env): RazorpayConfig | null {
  const keyId = env.RAZORPAY_KEY_ID?.trim();
  const keySecret = env.RAZORPAY_KEY_SECRET?.trim();
  const monthly = env.RAZORPAY_PLAN_MONTHLY?.trim();
  const yearly = env.RAZORPAY_PLAN_YEARLY?.trim();
  if (!keyId || !keySecret || !monthly || !yearly) return null;
  return { keyId, keySecret, webhookSecret: env.RAZORPAY_WEBHOOK_SECRET?.trim() || null, plans: { monthly, yearly } };
}

export function priceLabels(env: NodeJS.ProcessEnv = process.env): Record<PlanId, string> {
  return {
    monthly: env.MAGNUS_PRICE_MONTHLY_LABEL?.trim() || "₹299 / month",
    yearly: env.MAGNUS_PRICE_YEARLY_LABEL?.trim() || "₹1,999 / year",
  };
}

const hmac = (secret: string, data: string | Buffer) => createHmac("sha256", secret).update(data).digest("hex");

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Checkout's success handler signature: HMAC(payment_id|subscription_id, key secret). */
export function verifyCheckoutSignature(paymentId: string, subscriptionId: string, signature: string, keySecret: string): boolean {
  return safeEqualHex(hmac(keySecret, `${paymentId}|${subscriptionId}`), signature);
}

export function verifyWebhookSignature(rawBody: Buffer, signature: string, webhookSecret: string): boolean {
  return safeEqualHex(hmac(webhookSecret, rawBody), signature);
}

/** Months of renewals Razorpay will bill before the subscription completes. */
const TOTAL_COUNT: Record<PlanId, number> = { monthly: 120, yearly: 10 };

export async function createRazorpaySubscription(
  userProfileId: string,
  plan: PlanId,
  cfg: RazorpayConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; subscriptionId: string; keyId: string } | { ok: false; error: "billing_unavailable" }> {
  const res = await fetchImpl("https://api.razorpay.com/v1/subscriptions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64")}`,
    },
    body: JSON.stringify({
      plan_id: cfg.plans[plan],
      total_count: TOTAL_COUNT[plan],
      customer_notify: 1,
      notes: { user_profile_id: userProfileId, plan },
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; error?: { description?: string } };
  if (!res.ok || !body.id) {
    logger.warn({ status: res.status, err: body.error?.description }, "razorpay subscription create failed");
    return { ok: false, error: "billing_unavailable" };
  }
  await saveSubscription(userProfileId, { provider: "razorpay", provider_subscription_id: body.id, plan, status: "pending", current_period_end: null });
  return { ok: true, subscriptionId: body.id, keyId: cfg.keyId };
}

async function saveSubscription(userProfileId: string, row: SubscriptionRow): Promise<void> {
  const { error } = await supabase
    .from("user_subscriptions")
    .upsert({ user_profile_id: userProfileId, ...row, updated_at: new Date().toISOString() }, { onConflict: "user_profile_id" });
  if (error) throw new Error(`save subscription: ${error.message}`);
  forgetEntitlement(userProfileId);
}

export const confirmInput = z.object({
  razorpay_payment_id: z.string().min(1).max(100),
  razorpay_subscription_id: z.string().min(1).max(100),
  razorpay_signature: z.string().min(1).max(200),
});

const PERIOD_MS: Record<PlanId, number> = { monthly: 31 * DAY_MS, yearly: 366 * DAY_MS };

/** Checkout said it was paid: verify, then turn Pro on. The webhook sets the exact period later. */
export async function confirmRazorpayCheckout(
  userProfileId: string,
  input: z.infer<typeof confirmInput>,
  cfg: RazorpayConfig,
  now = new Date(),
): Promise<{ ok: boolean; error?: string }> {
  if (!verifyCheckoutSignature(input.razorpay_payment_id, input.razorpay_subscription_id, input.razorpay_signature, cfg.keySecret)) {
    return { ok: false, error: "invalid_signature" };
  }
  const { data } = await supabase
    .from("user_subscriptions")
    .select("plan, provider_subscription_id")
    .eq("user_profile_id", userProfileId)
    .maybeSingle();
  const row = data as { plan: PlanId; provider_subscription_id: string | null } | null;
  if (!row || row.provider_subscription_id !== input.razorpay_subscription_id) return { ok: false, error: "subscription_not_found" };
  await saveSubscription(userProfileId, {
    provider: "razorpay",
    provider_subscription_id: input.razorpay_subscription_id,
    plan: row.plan,
    status: "active",
    current_period_end: new Date(now.getTime() + PERIOD_MS[row.plan]).toISOString(),
  });
  return { ok: true };
}

const RAZORPAY_STATUS: Record<string, SubscriptionStatus> = {
  created: "pending",
  authenticated: "pending",
  active: "active",
  pending: "past_due",
  halted: "past_due",
  cancelled: "cancelled",
  completed: "expired",
  expired: "expired",
};

type RazorpayEvent = {
  event?: string;
  payload?: { subscription?: { entity?: { id?: string; status?: string; current_end?: number | null; plan_id?: string; notes?: Record<string, string> } } };
};

/** Subscription webhooks: keep status and the paid-through date in step with Razorpay. */
export async function applyRazorpayEvent(event: RazorpayEvent, cfg: RazorpayConfig): Promise<"applied" | "ignored"> {
  const sub = event.payload?.subscription?.entity;
  if (!sub?.id || !sub.status) return "ignored";
  const status = RAZORPAY_STATUS[sub.status];
  if (!status) return "ignored";
  let userProfileId = sub.notes?.user_profile_id ?? null;
  if (!userProfileId) {
    const { data } = await supabase
      .from("user_subscriptions")
      .select("user_profile_id")
      .eq("provider", "razorpay")
      .eq("provider_subscription_id", sub.id)
      .maybeSingle();
    userProfileId = (data as { user_profile_id?: string } | null)?.user_profile_id ?? null;
  }
  if (!userProfileId) return "ignored";
  const plan: PlanId = sub.plan_id === cfg.plans.yearly ? "yearly" : "monthly";
  await saveSubscription(userProfileId, {
    provider: "razorpay",
    provider_subscription_id: sub.id,
    plan,
    status,
    current_period_end: sub.current_end ? new Date(sub.current_end * 1000).toISOString() : null,
  });
  logger.info({ userProfileId, event: event.event, status }, "razorpay subscription updated");
  return "applied";
}

/** Cancel at the end of the paid period; Pro stays on until then. */
export async function cancelRazorpaySubscription(
  userProfileId: string,
  cfg: RazorpayConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; error?: string }> {
  const { data } = await supabase
    .from("user_subscriptions")
    .select("provider, provider_subscription_id, plan, status, current_period_end")
    .eq("user_profile_id", userProfileId)
    .maybeSingle();
  const row = data as SubscriptionRow | null;
  if (!row || row.provider !== "razorpay" || !row.provider_subscription_id) return { ok: false, error: "no_subscription" };
  const res = await fetchImpl(`https://api.razorpay.com/v1/subscriptions/${row.provider_subscription_id}/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64")}`,
    },
    body: JSON.stringify({ cancel_at_cycle_end: 1 }),
  });
  if (!res.ok) return { ok: false, error: "billing_unavailable" };
  await saveSubscription(userProfileId, { ...row, status: "cancelled" });
  return { ok: true };
}
