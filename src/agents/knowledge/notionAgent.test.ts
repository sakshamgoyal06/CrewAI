import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runNotionAgent } from "./notionAgent.js";

describe("runNotionAgent", () => {
  beforeEach(() => {
    vi.stubEnv("NOTION_TOKEN", "");
    vi.stubEnv("NOTION_API_KEY", "");
    vi.stubEnv("NOTION_INTEGRATION_TOKEN", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns configuration hint when Notion token is absent", async () => {
    const out = await runNotionAgent({
      userProfileId: "00000000-0000-0000-0000-000000000001",
      telegramUserId: "1",
      rawMessage: "log this to notion: hello",
      intent: "NOTION",
    });

    expect(out.text).toMatch(/configured/i);
    expect(out.metadata.configured).toBe(false);
  });
});
