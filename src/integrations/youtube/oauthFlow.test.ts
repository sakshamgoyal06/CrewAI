import { beforeEach, describe, expect, it, vi } from "vitest";

const redisSet = vi.hoisted(() => vi.fn());
const redisGet = vi.hoisted(() => vi.fn());
const redisDel = vi.hoisted(() => vi.fn());
const upsert = vi.hoisted(() => vi.fn());
const getToken = vi.hoisted(() => vi.fn());
const generateAuthUrl = vi.hoisted(() => vi.fn());

vi.mock("../../tools/clients.js", () => ({
  redis: {
    set: redisSet,
    get: redisGet,
    del: redisDel,
  },
}));

vi.mock("../../users/userIntegrations.js", () => ({
  upsertUserIntegrations: upsert,
}));

vi.mock("./auth.js", () => ({
  createOAuth2Client: () => ({
    generateAuthUrl,
    getToken,
  }),
}));

vi.mock("../../config/publicBaseUrl.js", () => ({
  youtubeOauthRedirectUri: () => "https://magnus.example.com/oauth/youtube/callback",
  YOUTUBE_OAUTH_CALLBACK_PATH: "/oauth/youtube/callback",
}));

import { beginYoutubeOauth, completeYoutubeOauth } from "./oauthFlow.js";

describe("youtube oauth flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_CLIENT_ID = "client";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    generateAuthUrl.mockReturnValue("https://accounts.google.com/o/oauth2/v2/auth?x=1");
  });

  it("mints a state and auth URL for connect-in-chat", async () => {
    redisSet.mockResolvedValue("OK");
    const out = await beginYoutubeOauth({
      userProfileId: "user-1",
      telegramChatId: "7174221900",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.authUrl).toContain("accounts.google.com");
    expect(out.redirectUri).toContain("/oauth/youtube/callback");
    expect(redisSet).toHaveBeenCalled();
    expect(generateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        access_type: "offline",
        prompt: "consent",
        state: expect.any(String),
      }),
    );
  });

  it("stores the refresh token and returns the telegram chat on success", async () => {
    redisGet.mockResolvedValue(
      JSON.stringify({
        userProfileId: "user-1",
        telegramChatId: "7174221900",
        createdAt: new Date().toISOString(),
      }),
    );
    redisDel.mockResolvedValue(1);
    getToken.mockResolvedValue({ tokens: { refresh_token: "1//refresh" } });
    upsert.mockResolvedValue({ ok: true });

    const out = await completeYoutubeOauth({ code: "abc", state: "state1" });
    expect(out).toEqual({
      ok: true,
      userProfileId: "user-1",
      telegramChatId: "7174221900",
    });
    expect(upsert).toHaveBeenCalledWith({
      userProfileId: "user-1",
      googleYoutubeRefreshToken: "1//refresh",
    });
    expect(redisDel).toHaveBeenCalled();
  });

  it("rejects expired or missing state", async () => {
    redisGet.mockResolvedValue(null);
    const out = await completeYoutubeOauth({ code: "abc", state: "gone" });
    expect(out.ok).toBe(false);
    if (out.ok) {
      return;
    }
    expect(out.userFacing).toMatch(/expired|fresh/i);
  });
});
