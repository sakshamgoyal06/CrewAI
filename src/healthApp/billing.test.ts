import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {}, redis: {}, anthropic: {} }));

import {
  createRazorpaySubscription,
  entitlementFrom,
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
});
