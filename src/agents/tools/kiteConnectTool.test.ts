import { beforeEach, describe, expect, it, vi } from "vitest";

const beginKiteOauth = vi.hoisted(() => vi.fn());
const loadUserIntegrations = vi.hoisted(() => vi.fn());

vi.mock("../../integrations/zerodha/oauthFlow.js", () => ({
  beginKiteOauth,
  kiteOauthLinkAvailable: () => true,
  kiteOauthRedirectConfigured: () => "https://magnus.example.com/oauth/kite/callback",
}));

vi.mock("../../pillars/wealth/zerodha/kiteEnv.js", () => ({
  kitePlatformReady: () => true,
}));

vi.mock("../../users/userIntegrations.js", () => ({
  loadUserIntegrations,
}));

import { connectKiteTool, isKiteConnectRequest } from "./kiteConnectTool.js";

describe("isKiteConnectRequest", () => {
  it("detects connect zerodha phrases", () => {
    expect(isKiteConnectRequest("connect zerodha")).toBe(true);
    expect(isKiteConnectRequest("link my kite account")).toBe(true);
    expect(isKiteConnectRequest("what are my holdings")).toBe(false);
  });
});

describe("connectKiteTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadUserIntegrations.mockResolvedValue({});
  });

  it("returns already connected when token exists", async () => {
    loadUserIntegrations.mockResolvedValue({ kiteAccessToken: "tok", kiteUserId: "AB1234" });
    const out = await connectKiteTool({ userProfileId: "u1", telegramUserId: "123" });
    expect(out).toMatch(/already connected/i);
    expect(beginKiteOauth).not.toHaveBeenCalled();
  });

  it("returns login URL when not connected", async () => {
    beginKiteOauth.mockResolvedValue({
      ok: true,
      authUrl: "https://kite.zerodha.com/connect/login?v=3&api_key=x",
      redirectUri: "https://magnus.example.com/oauth/kite/callback",
    });
    const out = await connectKiteTool({ userProfileId: "u1", telegramUserId: "123" });
    expect(out).toContain("kite.zerodha.com");
    expect(beginKiteOauth).toHaveBeenCalledWith({
      userProfileId: "u1",
      telegramChatId: "123",
    });
  });
});
