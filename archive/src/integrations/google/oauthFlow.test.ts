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

vi.mock("../youtube/auth.js", () => ({
  createOAuth2Client: () => ({
    generateAuthUrl,
    getToken,
  }),
}));

vi.mock("../../config/publicBaseUrl.js", () => ({
  googleOauthRedirectUri: () => "https://magnus.example.com/oauth/google/callback",
  GOOGLE_OAUTH_CALLBACK_PATH: "/oauth/google/callback",
}));

import { beginGoogleOauth, completeGoogleOauth } from "./oauthFlow.js";

describe("google unified oauth flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_CLIENT_ID = "client";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    generateAuthUrl.mockReturnValue("https://accounts.google.com/o/oauth2/v2/auth?x=1");
  });

  it("mints a state and auth URL with combined scopes", async () => {
    redisSet.mockResolvedValue("OK");
    const out = await beginGoogleOauth({
      userProfileId: "user-1",
      telegramChatId: "7174221900",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.authUrl).toContain("accounts.google.com");
    expect(out.redirectUri).toContain("/oauth/google/callback");
    expect(generateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        access_type: "offline",
        prompt: "consent",
        scope: expect.arrayContaining([
          "https://www.googleapis.com/auth/calendar.events",
          "https://www.googleapis.com/auth/youtube.force-ssl",
        ]),
      }),
    );
  });

  it("dual-writes the refresh token to calendar and youtube columns", async () => {
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

    const out = await completeGoogleOauth({ code: "abc", state: "state1" });
    expect(out).toEqual({
      ok: true,
      userProfileId: "user-1",
      telegramChatId: "7174221900",
    });
    expect(upsert).toHaveBeenCalledWith({
      userProfileId: "user-1",
      googleCalendarRefreshToken: "1//refresh",
      googleYoutubeRefreshToken: "1//refresh",
    });
  });

  it("rejects expired or missing state", async () => {
    redisGet.mockResolvedValue(null);
    const out = await completeGoogleOauth({ code: "abc", state: "gone" });
    expect(out.ok).toBe(false);
    if (out.ok) {
      return;
    }
    expect(out.userFacing).toMatch(/expired|fresh/i);
  });
});
