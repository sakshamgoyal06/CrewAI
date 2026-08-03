import { beforeEach, describe, expect, it, vi } from "vitest";

const beginOauth = vi.hoisted(() => vi.fn());
const getStatus = vi.hoisted(() => vi.fn());

vi.mock("../../integrations/notion/oauthFlow.js", () => ({
  beginNotionOauth: beginOauth,
  notionOauthLinkAvailable: vi.fn(() => true),
  notionOauthRedirectConfigured: vi.fn(() => "https://magnus.example.com/oauth/notion/callback"),
  platformNotionOAuthReady: vi.fn(() => true),
}));

vi.mock("../../integrations/notion/notionSetup.js", () => ({
  getNotionSetupStatus: getStatus,
  discoverNotionLists: vi.fn(),
  notionConnectInstructions: vi.fn(() => "manual instructions"),
  saveNotionToken: vi.fn(),
  setNotionHub: vi.fn(),
  syncRegistryFromLists: vi.fn(),
}));

import { connectNotionTool } from "./notionConnectTool.js";

describe("connectNotionTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    beginOauth.mockResolvedValue({
      ok: true,
      authUrl: "https://api.notion.com/v1/oauth/authorize?state=abc",
      redirectUri: "https://magnus.example.com/oauth/notion/callback",
    });
  });

  it("sends OAuth link even when a legacy token is already saved", async () => {
    getStatus.mockResolvedValue({
      tokenConnected: true,
      tokenValid: true,
      connectionKind: "manual",
      missingSteps: [],
      listsProvisioned: 10,
      listsNotionLinked: 9,
      hubPageId: "hub-1",
    });

    const out = await connectNotionTool({
      userProfileId: "user-1",
      telegramUserId: "7174221900",
    });

    expect(beginOauth).toHaveBeenCalled();
    expect(out).toContain("https://api.notion.com/v1/oauth/authorize");
    expect(out).toContain("dedicated Magnus space");
    expect(out).not.toContain("fully set up");
  });

  it("sends OAuth link for first-time connect", async () => {
    getStatus.mockResolvedValue({
      tokenConnected: false,
      tokenValid: false,
      connectionKind: "none",
      missingSteps: ["Connect Notion"],
      listsProvisioned: 10,
      listsNotionLinked: 0,
    });

    const out = await connectNotionTool({
      userProfileId: "user-1",
      telegramUserId: "7174221900",
    });

    expect(out).toContain("Open this link to connect Notion");
    expect(out).not.toContain("legacy");
  });
});
