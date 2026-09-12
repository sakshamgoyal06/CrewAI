import { beforeEach, describe, expect, it, vi } from "vitest";

const from = vi.hoisted(() => vi.fn());

vi.mock("../../tools/clients.js", () => ({
  supabase: { from },
}));

vi.mock("../../lists/listService.js", () => ({
  getDailyCheckin: vi.fn().mockResolvedValue("Morning intention: ship the PR."),
}));

vi.mock("./eventLogTool.js", () => ({
  listEventsTool: vi.fn().mockResolvedValue("- Gym done"),
}));

import { getDailyLog } from "./dailyLogReadTool.js";

describe("getDailyLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [{ body: "Good day.", source: "telegram", metadata: null }],
              error: null,
            }),
          }),
        }),
      }),
    });
  });

  it("combines notes, check-in, and commitments for a date", async () => {
    const out = await getDailyLog({
      userProfileId: "u1",
      date: "2026-09-12",
      timeZone: "UTC",
    });

    expect(out).toContain("2026-09-12");
    expect(out).toContain("Good day.");
    expect(out).toContain("Morning intention");
    expect(out).toContain("Gym done");
  });
});
