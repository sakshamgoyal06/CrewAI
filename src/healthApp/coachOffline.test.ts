import { describe, expect, it, vi } from "vitest";

vi.mock("./push.js", () => ({ sendNotification: vi.fn() }));

import { alertOwnerCoachOffline, isCoachOffline } from "./coachOffline.js";

describe("isCoachOffline", () => {
  it("spots an out-of-credit API account", () => {
    const err = new Error(
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}',
    );
    expect(isCoachOffline(err)).toBe(true);
  });

  it("spots a bad key", () => {
    expect(isCoachOffline(new Error('401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'))).toBe(true);
  });

  it("leaves ordinary and transient failures alone", () => {
    expect(isCoachOffline(new Error('529 {"type":"error","error":{"type":"overloaded_error"}}'))).toBe(false);
    expect(isCoachOffline(new Error("fetch failed"))).toBe(false);
  });
});

describe("alertOwnerCoachOffline", () => {
  it("pushes the owner once per UTC hour", async () => {
    const send = vi.fn().mockResolvedValue({ sent: true });
    await alertOwnerCoachOffline(new Date("2026-11-04T02:28:43Z"), send, {});
    expect(send).toHaveBeenCalledWith(
      "73365666-4285-42af-a59e-43ba68ea65c0",
      expect.objectContaining({ kind: "ops_alert", dedupeKey: "coach_offline:2026-11-04T02" }),
    );
  });

  it("never throws when the push fails", async () => {
    const send = vi.fn().mockRejectedValue(new Error("push down"));
    await expect(alertOwnerCoachOffline(new Date(), send, {})).resolves.toBeUndefined();
  });
});
