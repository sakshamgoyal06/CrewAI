import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createLifeosGoal,
  logHappinessReserve,
  normalizeLifeosPillar,
  upsertPillarStatus,
} from "./lifeosStore.js";

describe("normalizeLifeosPillar", () => {
  it("maps joy and wisdom to LifeOS pillars", () => {
    expect(normalizeLifeosPillar("joy")).toBe("happiness");
    expect(normalizeLifeosPillar("wisdom")).toBe("learning");
    expect(normalizeLifeosPillar("health")).toBe("health");
  });
});

describe("lifeosStore", () => {
  const insert = vi.fn();
  const update = vi.fn();
  const select = vi.fn();
  const from = vi.fn(() => ({ insert, update, select }));
  const client = { from } as unknown as import("@supabase/supabase-js").SupabaseClient;

  beforeEach(() => {
    insert.mockReset();
    update.mockReset();
    select.mockReset();
    from.mockClear();
  });

  it("creates a goal row", async () => {
    insert.mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({ data: { id: "g-1" }, error: null }),
      }),
    });

    const result = await createLifeosGoal(
      { userProfileId: "u1", title: "Ship Magnus", pillar: "wisdom" },
      { client },
    );
    expect(result.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ pillar: "learning", title: "Ship Magnus" }),
    );
  });

  it("upserts pillar status for a date", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    select.mockReturnValue({
      eq: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle }),
        }),
      }),
    });
    insert.mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({ data: { id: "ps-1" }, error: null }),
      }),
    });

    const result = await upsertPillarStatus(
      {
        userProfileId: "u1",
        pillar: "health",
        date: "2026-08-04",
        status: "on_track",
        score: 8,
      },
      { client },
    );
    expect(result.ok).toBe(true);
  });

  it("rejects invalid joy tank level", async () => {
    const result = await logHappinessReserve(
      { userProfileId: "u1", date: "2026-08-04", level: 150 },
      { client },
    );
    expect(result.ok).toBe(false);
  });
});
