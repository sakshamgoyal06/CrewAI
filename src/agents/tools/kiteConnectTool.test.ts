import { beforeEach, describe, expect, it, vi } from "vitest";

const beginKiteOauth = vi.hoisted(() => vi.fn());
const loadUserIntegrations = vi.hoisted(() => vi.fn());
const appCreds = vi.hoisted(() => vi.fn());

vi.mock("../../integrations/zerodha/oauthFlow.js", () => ({
  beginKiteOauth,
  kiteOauthLinkAvailableForUser: vi.fn(async () => true),
  kiteOauthRedirectConfigured: () => "https://magnus.example.com/oauth/kite/callback",
}));

vi.mock("../../pillars/wealth/zerodha/kiteEnv.js", () => ({
  kiteAppCredentialsForUser: appCreds,
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
    appCreds.mockResolvedValue({ apiKey: "key", apiSecret: "secret" });
  });

  it("returns already connected when token exists", async () => {
    loadUserIntegrations.mockResolvedValue({ kiteAccessToken: "tok", kiteUserId: "AB1234" });
    const out = await connectKiteTool({ userProfileId: "u1", telegramUserId: "123" });
    expect(out).toMatch(/already connected/i);
    expect(beginKiteOauth).not.toHaveBeenCalled();
  });

  it("prompts upsert when app credentials missing", async () => {
    appCreds.mockResolvedValue(undefined);
    const out = await connectKiteTool({ userProfileId: "u1", telegramUserId: "123" });
    expect(out).toMatch(/user_integrations/i);
    expect(beginKiteOauth).not.toHaveBeenCalled();
  });

  it("returns login URL when app creds exist but not connected", async () => {
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
