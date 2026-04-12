import { afterEach, describe, expect, it } from "vitest";

import { isDelegationNoticeEnabled } from "./projectSettings.js";

describe("isDelegationNoticeEnabled", () => {
  afterEach(() => {
    delete process.env.MAGNUS_DELEGATION_NOTICE;
  });

  it("defaults to true when unset", () => {
    delete process.env.MAGNUS_DELEGATION_NOTICE;
    expect(isDelegationNoticeEnabled()).toBe(true);
  });

  it("is false when explicitly disabled", () => {
    process.env.MAGNUS_DELEGATION_NOTICE = "false";
    expect(isDelegationNoticeEnabled()).toBe(false);
  });
});
