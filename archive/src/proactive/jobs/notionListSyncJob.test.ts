import { beforeEach, describe, expect, it, vi } from "vitest";

const syncSupabaseToNotion = vi.hoisted(() => vi.fn());
const redisSet = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());

vi.mock("../../integrations/notion/notionListSync.js", () => ({
  syncSupabaseToNotion,
}));

vi.mock("../../tools/clients.js", () => ({
  redis: { set: redisSet },
  supabase: { from },
}));

import { notionListSyncScheduledJob } from "./notionListSyncJob.js";

describe("notionListSyncScheduledJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MAGNUS_NOTION_LIST_SYNC_INTERVAL_MINUTES = "60";
    process.env.MAGNUS_NOTION_LIST_SYNC_ENABLED = "true";
    from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        not: vi.fn().mockResolvedValue({
          data: [{ user_profile_id: "u1", notion_token: "secret" }],
          error: null,
        }),
      }),
    });
    redisSet.mockResolvedValue("OK");
    syncSupabaseToNotion.mockResolvedValue("done");
  });

  it("syncs connected users once per interval window", async () => {
    await notionListSyncScheduledJob.run({ now: new Date() });
    expect(syncSupabaseToNotion).toHaveBeenCalledWith("u1");
    expect(redisSet).toHaveBeenCalled();
  });
});
