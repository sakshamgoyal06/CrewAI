import { describe, expect, it } from "vitest";
import { isCoachOffline } from "./coachOffline.js";

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
