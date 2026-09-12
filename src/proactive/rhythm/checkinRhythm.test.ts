import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchListBySlug = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());

vi.mock("../../lists/listStore.js", () => ({
  fetchListBySlug,
  fetchCheckinItem: vi.fn(),
}));

vi.mock("../../tools/clients.js", () => ({
  supabase: { from: (...args: unknown[]) => from(...args) },
}));

import { countDaysWithoutMorningOrientation } from "./checkinRhythm.js";

/** Chainable PostgREST stub that resolves to the given rows. */
function selectReturning(rows: unknown[], error: unknown = null) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "gte", "lt"]) {
    chain[method] = () => chain;
  }
  chain.then = (resolve: (value: { data: unknown[]; error: unknown }) => unknown) =>
    resolve({ data: rows, error });
  return chain;
}

describe("countDaysWithoutMorningOrientation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchListBySlug.mockResolvedValue({ ok: true, data: { id: "list-checkins" } });
  });

  // The brief asked the same question 24 mornings running without noticing the silence.
  it("counts every consecutive silent day in the lookback window", async () => {
    from.mockReturnValue(selectReturning([]));
    await expect(countDaysWithoutMorningOrientation("u1", "2026-09-12")).resolves.toBe(7);
  });

  it("stops counting at the most recent answered day", async () => {
    from.mockReturnValue(
      selectReturning([
        { title: "2026-09-09", extra: { "Morning Intention": "Ship the PR" } },
        { title: "2026-09-06", extra: { "Morning Intention": "Rest" } },
      ]),
    );
    await expect(countDaysWithoutMorningOrientation("u1", "2026-09-12")).resolves.toBe(2);
  });

  it("treats a check-in with an empty intention as unanswered", async () => {
    from.mockReturnValue(
      selectReturning([{ title: "2026-09-11", extra: { "Morning Intention": "   " } }]),
    );
    await expect(countDaysWithoutMorningOrientation("u1", "2026-09-12")).resolves.toBe(7);
  });

  it("accepts energy level as morning orientation", async () => {
    from.mockReturnValue(selectReturning([{ title: "2026-09-11", extra: { "Energy Level": 7 } }]));
    await expect(countDaysWithoutMorningOrientation("u1", "2026-09-12")).resolves.toBe(0);
  });

  it("reports no silence it cannot verify", async () => {
    fetchListBySlug.mockResolvedValue({ ok: true, data: null });
    await expect(countDaysWithoutMorningOrientation("u1", "2026-09-12")).resolves.toBe(0);

    fetchListBySlug.mockResolvedValue({ ok: true, data: { id: "list-checkins" } });
    from.mockReturnValue(selectReturning([], { message: "boom" }));
    await expect(countDaysWithoutMorningOrientation("u1", "2026-09-12")).resolves.toBe(0);
  });
});
