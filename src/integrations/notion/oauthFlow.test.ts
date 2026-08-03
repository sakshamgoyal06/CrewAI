import { beforeEach, describe, expect, it, vi } from "vitest";

const redisSet = vi.hoisted(() => vi.fn());
const redisGet = vi.hoisted(() => vi.fn());
const redisDel = vi.hoisted(() => vi.fn());
const upsert = vi.hoisted(() => vi.fn());
const loadIntegrations = vi.hoisted(() => vi.fn());
const ensureLists = vi.hoisted(() => vi.fn());
const discover = vi.hoisted(() => vi.fn());
const clearMirrors = vi.hoisted(() => vi.fn());
const provision = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("../../tools/clients.js", () => ({
  redis: {
    set: redisSet,
    get: redisGet,
    del: redisDel,
  },
}));

vi.mock("../../users/userIntegrations.js", () => ({
  upsertUserIntegrations: upsert,
  loadUserIntegrations: loadIntegrations,
}));

vi.mock("../../lists/listService.js", () => ({
  ensureUserLists: ensureLists,
}));

vi.mock("./notionSetup.js", () => ({
  discoverNotionLists: discover,
  clearNotionListMirrors: clearMirrors,
}));

vi.mock("./notionProvision.js", () => ({
  provisionMagnusNotionSpace: provision,
}));

vi.mock("../../config/publicBaseUrl.js", () => ({
  notionOauthRedirectUri: () => "https://magnus.example.com/oauth/notion/callback",
  NOTION_OAUTH_CALLBACK_PATH: "/oauth/notion/callback",
}));

import { beginNotionOauth, completeNotionOauth } from "./oauthFlow.js";

describe("notion oauth flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NOTION_OAUTH_CLIENT_ID = "notion-client";
    process.env.NOTION_OAUTH_CLIENT_SECRET = "notion-secret";
    global.fetch = fetchMock as typeof fetch;
    loadIntegrations.mockResolvedValue({});
    ensureLists.mockResolvedValue([]);
    discover.mockResolvedValue("Discovered 2 list database(s):");
    provision.mockResolvedValue("Magnus Notion space ready.");
    clearMirrors.mockResolvedValue(undefined);
  });

  it("mints a state and Notion authorize URL", async () => {
    redisSet.mockResolvedValue("OK");
    const out = await beginNotionOauth({
      userProfileId: "user-1",
      telegramChatId: "7174221900",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.authUrl).toContain("api.notion.com/v1/oauth/authorize");
    expect(out.authUrl).toContain("client_id=notion-client");
    expect(out.authUrl).toContain(encodeURIComponent("/oauth/notion/callback"));
    expect(out.redirectUri).toContain("/oauth/notion/callback");
  });

  it("stores access token and runs discover on callback", async () => {
    redisGet.mockResolvedValue(
      JSON.stringify({
        userProfileId: "user-1",
        telegramChatId: "7174221900",
        createdAt: new Date().toISOString(),
      }),
    );
    redisDel.mockResolvedValue(1);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "secret_notion_access",
        refresh_token: "refresh_xyz",
        workspace_name: "LifeOS",
        workspace_id: "ws-1",
        bot_id: "bot-1",
      }),
    });
    upsert.mockResolvedValue({ ok: true });

    const out = await completeNotionOauth({ code: "abc", state: "state1" });
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.workspaceName).toBe("LifeOS");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userProfileId: "user-1",
        notionToken: "secret_notion_access",
      }),
    );
    expect(provision).toHaveBeenCalledWith("user-1");
    expect(clearMirrors).toHaveBeenCalledWith("user-1");
  });
});
