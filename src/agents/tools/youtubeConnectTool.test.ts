import { beforeEach, describe, expect, it, vi } from "vitest";

const beginYoutubeOauth = vi.hoisted(() => vi.fn());
const youtubeOauthReadyForUser = vi.hoisted(() => vi.fn());
const loadUserIntegrations = vi.hoisted(() => vi.fn());

vi.mock("../../integrations/youtube/oauthFlow.js", () => ({
  beginYoutubeOauth,
  youtubeOauthLinkAvailable: () => true,
  youtubeOauthRedirectConfigured: () =>
    "https://magnus.example.com/oauth/youtube/callback",
}));

vi.mock("../../integrations/youtube/auth.js", () => ({
  youtubeOauthReadyForUser,
  youtubePlatformConfigured: () => true,
}));

vi.mock("../../users/userIntegrations.js", () => ({
  loadUserIntegrations,
}));

import { connectYoutubeTool } from "./youtubeConnectTool.js";

describe("connectYoutubeTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    youtubeOauthReadyForUser.mockResolvedValue(false);
    loadUserIntegrations.mockResolvedValue({});
  });

  it("returns already connected when the user has a token", async () => {
    youtubeOauthReadyForUser.mockResolvedValue(true);
    loadUserIntegrations.mockResolvedValue({ youtubeRefreshToken: "1//x" });
    const out = await connectYoutubeTool({
      userProfileId: "u1",
      telegramUserId: "1",
    });
    expect(out).toMatch(/already connected/i);
    expect(beginYoutubeOauth).not.toHaveBeenCalled();
  });

  it("returns the consent URL for the user to open", async () => {
    beginYoutubeOauth.mockResolvedValue({
      ok: true,
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=abc",
      redirectUri: "https://magnus.example.com/oauth/youtube/callback",
    });
    const out = await connectYoutubeTool({
      userProfileId: "u1",
      telegramUserId: "7174221900",
    });
    expect(out).toContain("accounts.google.com");
    expect(out).toContain("/oauth/youtube/callback");
    expect(beginYoutubeOauth).toHaveBeenCalledWith({
      userProfileId: "u1",
      telegramChatId: "7174221900",
    });
  });
});
