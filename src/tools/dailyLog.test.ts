import { beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();

vi.mock("./clients.js", () => ({
  supabase: {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: insert,
        }),
      }),
    }),
  },
}));

import { recordMagnusDailyLog } from "./dailyLog.js";

describe("recordMagnusDailyLog", () => {
  beforeEach(() => {
    insert.mockReset();
  });

  it("inserts a row when Supabase succeeds", async () => {
    insert.mockResolvedValue({ data: { id: "log-1" }, error: null });
    const out = await recordMagnusDailyLog({
      userProfileId: "00000000-0000-0000-0000-000000000001",
      logDate: "2026-04-12",
      body: "Test note",
      source: "notion",
      notionPageId: "page-abc",
    });
    expect(out.ok).toBe(true);
    expect(out.id).toBe("log-1");
  });

  it("returns ok false on empty body without calling insert", async () => {
    const out = await recordMagnusDailyLog({
      userProfileId: "00000000-0000-0000-0000-000000000001",
      logDate: "2026-04-12",
      body: "   ",
      source: "telegram",
    });
    expect(out.ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });
});
