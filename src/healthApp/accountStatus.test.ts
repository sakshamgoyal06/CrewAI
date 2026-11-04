import { describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {}, anthropic: {} }));

import { disabledResponse, supportEmail } from "./accountStatus.js";

describe("paused accounts", () => {
  it("offers a ready-made review email to the support address, else the owner", () => {
    const env = { MAGNUS_OWNER_EMAIL: "owner@example.com" } as NodeJS.ProcessEnv;
    expect(supportEmail(env)).toBe("owner@example.com");
    expect(supportEmail({ ...env, MAGNUS_SUPPORT_EMAIL: "help@example.com" } as NodeJS.ProcessEnv)).toBe("help@example.com");
    const r = disabledResponse("profile-9", env);
    expect(r.error).toBe("account_disabled");
    expect(r.review?.mailto).toMatch(/^mailto:owner@example\.com\?subject=Magnus%20account%20review%20request&body=/);
    expect(decodeURIComponent(r.review!.mailto)).toContain("Account reference: profile-9");
    expect(disabledResponse("p", {} as NodeJS.ProcessEnv).review).toBeNull();
  });
});
