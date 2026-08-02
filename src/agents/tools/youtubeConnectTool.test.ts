import { beforeEach, describe, expect, it, vi } from "vitest";

const beginGoogleOauth = vi.hoisted(() => vi.fn());
const loadUserIntegrations = vi.hoisted(() => vi.fn());

vi.mock("../../integrations/google/oauthFlow.js", () => ({
  beginGoogleOauth,
  googleOauthLinkAvailable: () => true,
  googleOauthRedirectConfigured: () => "https://magnus.example.com/oauth/google/callback",
}));

vi.mock("../../users/userIntegrations.js", () => ({
  loadUserIntegrations,
}));

import { connectGoogleTool, connectYoutubeTool } from "./youtubeConnectTool.js";

describe("connectGoogleTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadUserIntegrations.mockResolvedValue({});
    process.env.GOOGLE_CLIENT_ID = "client";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
  });

  it("returns already connected when both tokens are present", async () => {
    loadUserIntegrations.mockResolvedValue({
      googleCalendarRefreshToken: "1//c",
      googleYoutubeRefreshToken: "1//y",
    });
    const out = await connectGoogleTool({
      userProfileId: "u1",
      telegramUserId: "1",
    });
    expect(out).toMatch(/already connected/i);
    expect(beginGoogleOauth).not.toHaveBeenCalled();
  });

  it("returns a combined Calendar + YouTube consent URL", async () => {
    beginGoogleOauth.mockResolvedValue({
      ok: true,
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=abc",
      redirectUri: "https://magnus.example.com/oauth/google/callback",
    });
    const out = await connectYoutubeTool({
      userProfileId: "u1",
      telegramUserId: "7174221900",
    });
    expect(out).toContain("accounts.google.com");
    expect(out).toMatch(/Calendar/i);
    expect(out).toContain("/oauth/google/callback");
    expect(beginGoogleOauth).toHaveBeenCalledWith({
      userProfileId: "u1",
      telegramChatId: "7174221900",
    });
  });
});
