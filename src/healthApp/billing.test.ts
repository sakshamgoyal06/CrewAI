import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ row: null as Record<string, unknown> | null }));
vi.mock("../tools/clients.js", () => {
  const chain: Record<string, unknown> = {};
  for (const k of ["select", "eq"]) chain[k] = () => chain;
  chain.maybeSingle = async () => ({ data: db.row, error: null });
  return { supabase: { from: () => chain }, anthropic: {} };
});

import {
  createRazorpaySubscription,
  entitlementFrom,
  experienceFor,
  mergeRazorpayUpdate,
  previewEntitlement,
  limitFor,
  razorpayConfig,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from "./billing.js";

const now = new Date("2026-11-10T00:00:00Z");
const sub = (status: "active" | "cancelled" | "past_due" | "pending", end: string | null) => ({
  provider: "razorpay" as const,
  provider_subscription_id: "sub_1",
  plan: "monthly" as const,
  status,
  current_period_end: end,
});

describe("entitlementFrom", () => {
  it("gives a 7-day trial from sign-up, then the free plan", () => {
    expect(entitlementFrom({ createdAt: "2026-11-05T00:00:00Z", sub: null, isOwner: false, now }).tier).toBe("trial");
    const r = entitlementFrom({ createdAt: "2026-11-01T00:00:00Z", sub: null, isOwner: false, now });
    expect(r.tier).toBe("free");
    expect(r.trialEndsAt).toBe("2026-11-08T00:00:00.000Z");
  });

  it("is Pro while paid, through a cancelled period, and in a short grace after a failed renewal", () => {
    const old = "2026-10-01T00:00:00Z";
    expect(entitlementFrom({ createdAt: old, sub: sub("active", "2026-12-01T00:00:00Z"), isOwner: false, now }).tier).toBe("pro");
    expect(entitlementFrom({ createdAt: old, sub: sub("cancelled", "2026-11-20T00:00:00Z"), isOwner: false, now }).tier).toBe("pro");
    expect(entitlementFrom({ createdAt: old, sub: sub("cancelled", "2026-11-09T00:00:00Z"), isOwner: false, now }).tier).toBe("free");
    expect(entitlementFrom({ createdAt: old, sub: sub("past_due", "2026-11-08T00:00:00Z"), isOwner: false, now }).tier).toBe("pro");
    expect(entitlementFrom({ createdAt: old, sub: sub("past_due", "2026-11-01T00:00:00Z"), isOwner: false, now }).tier).toBe("free");
    expect(entitlementFrom({ createdAt: old, sub: sub("pending", null), isOwner: false, now }).tier).toBe("free");
  });

  it("always gives the owner Pro", () => {
    expect(entitlementFrom({ createdAt: "2020-01-01T00:00:00Z", sub: null, isOwner: true, now }).tier).toBe("pro");
  });
});

describe("limitFor", () => {
  it("only caps the free plan, and only when billing is on", () => {
    expect(limitFor("free", "chat", {})).toBeUndefined();
    expect(limitFor("free", "chat", { MAGNUS_BILLING: "on" })).toBe(5);
    expect(limitFor("free", "photo", { MAGNUS_BILLING: "on" })).toBe(1);
    expect(limitFor("free", "chat", { MAGNUS_BILLING: "on", MAGNUS_FREE_CHAT_LIMIT: "8" })).toBe(8);
    expect(limitFor("trial", "chat", { MAGNUS_BILLING: "on" })).toBeUndefined();
    expect(limitFor("pro", "photo", { MAGNUS_BILLING: "on" })).toBeUndefined();
  });
});

describe("Razorpay signatures", () => {
  it("verifies checkout and webhook signatures", () => {
    const sig = createHmac("sha256", "secret").update("pay_1|sub_1").digest("hex");
    expect(verifyCheckoutSignature("pay_1", "sub_1", sig, "secret")).toBe(true);
    expect(verifyCheckoutSignature("pay_2", "sub_1", sig, "secret")).toBe(false);
    const body = Buffer.from('{"event":"subscription.charged"}');
    const wsig = createHmac("sha256", "whsec").update(body).digest("hex");
    expect(verifyWebhookSignature(body, wsig, "whsec")).toBe(true);
    expect(verifyWebhookSignature(body, "short", "whsec")).toBe(false);
  });
});

describe("razorpayConfig", () => {
  it("needs keys and both plans", () => {
    expect(razorpayConfig({ RAZORPAY_KEY_ID: "k" })).toBeNull();
    expect(
      razorpayConfig({ RAZORPAY_KEY_ID: "k", RAZORPAY_KEY_SECRET: "s", RAZORPAY_PLAN_MONTHLY: "plan_m", RAZORPAY_PLAN_YEARLY: "plan_y" })?.plans,
    ).toEqual({ monthly: "plan_m", yearly: "plan_y" });
  });

  it("reports a failed subscription create without saving", async () => {
    const cfg = { keyId: "k", keySecret: "s", webhookSecret: null, plans: { monthly: "m", yearly: "y" } };
    const f = vi.fn(async () => new Response(JSON.stringify({ error: { description: "bad plan" } }), { status: 400 }));
    expect(await createRazorpaySubscription("p1", "monthly", cfg, f)).toEqual({ ok: false, error: "billing_unavailable" });
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ plan_id: "m", notes: { user_profile_id: "p1" } });
  });

  it("won't start a second checkout while a subscription pays for Pro", async () => {
    const cfg = { keyId: "k", keySecret: "s", webhookSecret: null, plans: { monthly: "m", yearly: "y" } };
    const f = vi.fn();
    db.row = sub("active", "2026-12-01T00:00:00Z");
    expect(await createRazorpaySubscription("p1", "yearly", cfg, f as never, now)).toEqual({ ok: false, error: "already_subscribed" });
    expect(f).not.toHaveBeenCalled();
    db.row = null;
  });
});

describe("mergeRazorpayUpdate", () => {
  const other = (status: "active" | "pending", end: string | null) => ({ ...sub(status as "active", end), provider_subscription_id: "sub_2" });

  it("never lets another subscription replace a paid one, and only an activation replace an unpaid one", () => {
    expect(mergeRazorpayUpdate(sub("active", "2026-12-01T00:00:00Z"), other("active", "2027-01-01T00:00:00Z"), now)).toBeNull();
    expect(mergeRazorpayUpdate(sub("pending", null), other("pending", null), now)).toBeNull();
    expect(mergeRazorpayUpdate(sub("pending", null), other("active", "2026-12-10T00:00:00Z"), now)?.provider_subscription_id).toBe("sub_2");
  });

  it("ignores a late pending, keeps a cancel, and keeps the period end when the event has none", () => {
    expect(mergeRazorpayUpdate(sub("active", "2026-12-01T00:00:00Z"), sub("pending", null), now)).toBeNull();
    expect(mergeRazorpayUpdate(sub("cancelled", "2026-12-01T00:00:00Z"), sub("active", "2026-12-01T00:00:00Z"), now)?.status).toBe("cancelled");
    expect(mergeRazorpayUpdate(sub("active", "2026-12-01T00:00:00Z"), sub("past_due", null), now)).toMatchObject({ status: "past_due", current_period_end: "2026-12-01T00:00:00Z" });
    expect(mergeRazorpayUpdate(null, sub("active", "2026-12-01T00:00:00Z"), now)?.status).toBe("active");
  });
});

describe("trial start", () => {
  it("starts the trial at MAGNUS_TRIAL_FROM for people who signed up earlier", () => {
    const env = { MAGNUS_TRIAL_FROM: "2026-11-06" };
    const early = entitlementFrom({ createdAt: "2026-10-01T00:00:00Z", sub: null, isOwner: false, now, env });
    expect(early).toMatchObject({ tier: "trial", trialEndsAt: "2026-11-13T00:00:00.000Z" });
    const late = entitlementFrom({ createdAt: "2026-11-08T00:00:00Z", sub: null, isOwner: false, now, env });
    expect(late.trialEndsAt).toBe("2026-11-15T00:00:00.000Z");
  });
});

describe("experienceFor", () => {
  const on = { MAGNUS_BILLING: "on" };
  const ent = (over: Record<string, unknown>) => ({ tier: "free", trialEndsAt: null, periodEndsAt: null, status: null, plan: null, provider: null, ...over }) as never;
  const at = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();

  it("gives everyone everything, with no banner, while billing is off", () => {
    expect(experienceFor(ent({ tier: "free" }), now, {})).toMatchObject({ features: { digest: true, rca: true }, banner: null });
  });

  it("keeps the model-paid extras off the free plan only", () => {
    expect(experienceFor(ent({ tier: "free" }), now, on).features).toEqual({ digest: false, rca: false, photo: true });
    expect(experienceFor(ent({ tier: "trial", trialEndsAt: at(5) }), now, on).features.digest).toBe(true);
    expect(experienceFor(ent({ tier: "pro", status: "active", periodEndsAt: at(30) }), now, on).features.rca).toBe(true);
    // Preview shows banners but enforces nothing.
    expect(experienceFor(ent({ tier: "free" }), now, { MAGNUS_BILLING: "preview" }).features.digest).toBe(true);
  });

  it("warns as the trial or a cancelled plan runs out, and right after the trial", () => {
    expect(experienceFor(ent({ tier: "trial", trialEndsAt: at(5) }), now, on).banner).toBeNull();
    expect(experienceFor(ent({ tier: "trial", trialEndsAt: at(2) }), now, on).banner).toMatchObject({ kind: "trial_ending", action: "plans" });
    expect(experienceFor(ent({ tier: "free", trialEndsAt: at(-1) }), now, on).banner?.kind).toBe("trial_ended");
    expect(experienceFor(ent({ tier: "free", trialEndsAt: at(-10) }), now, on).banner).toBeNull();
    expect(experienceFor(ent({ tier: "pro", status: "cancelled", periodEndsAt: at(2) }), now, on).banner?.kind).toBe("ending");
    expect(experienceFor(ent({ tier: "pro", status: "cancelled", periodEndsAt: at(20) }), now, on).banner).toBeNull();
  });

  it("keeps a payment-issue banner up until it's fixed", () => {
    expect(experienceFor(ent({ tier: "pro", status: "past_due", periodEndsAt: at(-1) }), now, on).banner).toMatchObject({ kind: "payment_issue", action: "managePlan", dismissible: false });
  });

  it("previews each state with its banner", () => {
    const kinds = (["trial", "free", "pro", "past_due", "cancelled"] as const).map((st) => experienceFor(previewEntitlement(st, now), now, { MAGNUS_BILLING: "preview" }).banner?.kind ?? null);
    expect(kinds).toEqual(["trial_ending", "trial_ended", null, "payment_issue", "ending"]);
  });
});
