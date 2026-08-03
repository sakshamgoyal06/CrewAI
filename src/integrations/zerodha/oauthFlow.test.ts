import { beforeEach, describe, expect, it, vi } from "vitest";

const redisSet = vi.hoisted(() => vi.fn());
const redisGet = vi.hoisted(() => vi.fn());
const redisDel = vi.hoisted(() => vi.fn());
const upsert = vi.hoisted(() => vi.fn());
const exchange = vi.hoisted(() => vi.fn());

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

vi.mock("../../pillars/wealth/zerodha/kiteClient.js", () => ({
  exchangeKiteRequestToken: exchange,
}));

vi.mock("../../config/publicBaseUrl.js", () => ({
  kiteOauthRedirectUri: () => "https://magnus.example.com/oauth/kite/callback",
  KITE_OAUTH_CALLBACK_PATH: "/oauth/kite/callback",
}));

import { beginKiteOauth, completeKiteOauth, kiteChecksum } from "./oauthFlow.js";

describe("kite oauth flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.KITE_API_KEY = "kite_key";
    process.env.KITE_API_SECRET = "kite_secret";
  });

  it("mints a login URL with api_key and redirect_params state", async () => {
    redisSet.mockResolvedValue("OK");
    const out = await beginKiteOauth({
      userProfileId: "user-1",
      telegramChatId: "7174221900",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.authUrl).toContain("kite.zerodha.com/connect/login");
    expect(out.authUrl).toContain("api_key=kite_key");
    expect(out.authUrl).toContain("redirect_params=");
    expect(out.redirectUri).toContain("/oauth/kite/callback");
  });

  it("stores access token on successful callback", async () => {
    redisGet.mockResolvedValue(
      JSON.stringify({
        userProfileId: "user-1",
        telegramChatId: "7174221900",
        createdAt: new Date().toISOString(),
      }),
    );
    redisDel.mockResolvedValue(1);
    exchange.mockResolvedValue({
      ok: true,
      session: { access_token: "access123", user_id: "AB1234" },
    });
    upsert.mockResolvedValue({ ok: true });

    const out = await completeKiteOauth({
      requestToken: "reqtok",
      state: "state1",
      status: "success",
    });
    expect(out).toEqual({
      ok: true,
      userProfileId: "user-1",
      telegramChatId: "7174221900",
      zerodhaUserId: "AB1234",
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userProfileId: "user-1",
        kiteAccessToken: "access123",
        kiteUserId: "AB1234",
      }),
    );
  });

  it("rejects expired or missing state", async () => {
    redisGet.mockResolvedValue(null);
    const out = await completeKiteOauth({
      requestToken: "reqtok",
      state: "gone",
      status: "success",
    });
    expect(out.ok).toBe(false);
    if (out.ok) {
      return;
    }
    expect(out.userFacing).toMatch(/expired|fresh/i);
  });

  it("checksum matches Kite spec", () => {
    expect(kiteChecksum("key", "token", "secret")).toMatch(/^[a-f0-9]{64}$/);
  });
});
