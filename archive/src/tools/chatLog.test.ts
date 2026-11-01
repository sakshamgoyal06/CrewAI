import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseFrom = vi.hoisted(() => vi.fn());

vi.mock("./clients.js", () => ({
  supabase: {
    from: supabaseFrom,
  },
}));

vi.mock("../config/security.js", () => ({
  autoAllowlistNewUsers: vi.fn(() => false),
}));

import { resolveTelegramUserProfile } from "./chatLog.js";
import { autoAllowlistNewUsers } from "../config/security.js";

function chainMaybeSingle(result: { data: unknown; error: unknown }) {
  return {
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve(result),
      }),
    }),
  };
}

function chainInsert(result: { data: unknown; error: unknown }) {
  return {
    insert: () => ({
      select: () => ({
        single: () => Promise.resolve(result),
      }),
    }),
  };
}

describe("resolveTelegramUserProfile", () => {
  beforeEach(() => {
    supabaseFrom.mockReset();
    vi.mocked(autoAllowlistNewUsers).mockReturnValue(false);
  });

  it("returns existing profile for telegram_chat_id", async () => {
    supabaseFrom.mockReturnValueOnce(
      chainMaybeSingle({
        data: {
          id: "profile-a",
          allowlisted: true,
          user_tier: "standard",
          access_flags: { chat: true },
          timezone: "Asia/Kolkata",
          north_star_goal: "",
          display_name: "Alex",
        },
        error: null,
      }),
    );

    const profile = await resolveTelegramUserProfile("12345");
    expect(profile.profileId).toBe("profile-a");
    expect(profile.telegramUserId).toBe("12345");
    expect(profile.allowlisted).toBe(true);
    expect(profile.timezone).toBe("Asia/Kolkata");
  });

  it("creates a new profile when none exists", async () => {
    supabaseFrom
      .mockReturnValueOnce(chainMaybeSingle({ data: null, error: null }))
      .mockReturnValueOnce(
        chainInsert({
          data: {
            id: "profile-new",
            allowlisted: false,
            user_tier: "standard",
            access_flags: { chat: true, agents: false, deep_memory: false },
            timezone: "UTC",
            north_star_goal: "",
            display_name: null,
          },
          error: null,
        }),
      );

    const profile = await resolveTelegramUserProfile("99999");
    expect(profile.profileId).toBe("profile-new");
    expect(profile.allowlisted).toBe(false);
  });
});
