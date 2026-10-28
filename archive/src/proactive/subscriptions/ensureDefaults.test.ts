import { beforeEach, describe, expect, it, vi } from "vitest";

const listAllSubscriptions = vi.fn();
const upsertCatalogSubscription = vi.fn();
const redisSet = vi.fn();

vi.mock("./store.js", () => ({
  listAllSubscriptions: (...args: unknown[]) => listAllSubscriptions(...args),
  upsertCatalogSubscription: (...args: unknown[]) => upsertCatalogSubscription(...args),
}));

vi.mock("../../tools/clients.js", () => ({
  redis: { set: (...args: unknown[]) => redisSet(...args) },
}));

vi.mock("../../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { ensureDefaultRhythmSubscriptions, ensureDefaultRhythmSubscriptionsOncePerDay } =
  await import("./ensureDefaults.js");
const { RHYTHM_DEFAULT_ENABLED_KINDS } = await import("./types.js");

describe("ensureDefaultRhythmSubscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertCatalogSubscription.mockResolvedValue({ ok: true, data: {} });
  });

  it("inserts every default rhythm kind for a profile with no subscriptions", async () => {
    listAllSubscriptions.mockResolvedValue([]);

    const res = await ensureDefaultRhythmSubscriptions("user-1");

    expect(res.inserted).toEqual([...RHYTHM_DEFAULT_ENABLED_KINDS]);
    expect(upsertCatalogSubscription).toHaveBeenCalledTimes(RHYTHM_DEFAULT_ENABLED_KINDS.length);
    for (const call of upsertCatalogSubscription.mock.calls) {
      expect(call[0]).toMatchObject({
        userProfileId: "user-1",
        enabled: true,
        source: "system_default",
      });
    }
  });

  it("seeds the evening journal, which is what went dark in production", async () => {
    listAllSubscriptions.mockResolvedValue([]);

    const res = await ensureDefaultRhythmSubscriptions("user-1");

    expect(res.inserted).toContain("evening_journal");
    expect(res.inserted).toContain("drift_guard");
  });

  it("never re-enables a kind the user disabled", async () => {
    listAllSubscriptions.mockResolvedValue([
      { kind: "evening_journal", enabled: false },
      { kind: "drift_guard", enabled: false },
    ]);

    const res = await ensureDefaultRhythmSubscriptions("user-1");

    expect(res.inserted).not.toContain("evening_journal");
    expect(res.inserted).not.toContain("drift_guard");
    const seeded = upsertCatalogSubscription.mock.calls.map((c) => (c[0] as { kind: string }).kind);
    expect(seeded).not.toContain("evening_journal");
  });

  it("leaves custom reminders untouched", async () => {
    listAllSubscriptions.mockResolvedValue([{ kind: "custom_reminder", enabled: true }]);

    await ensureDefaultRhythmSubscriptions("user-1");

    const seeded = upsertCatalogSubscription.mock.calls.map((c) => (c[0] as { kind: string }).kind);
    expect(seeded).not.toContain("custom_reminder");
  });

  it("is idempotent once every default row exists", async () => {
    listAllSubscriptions.mockResolvedValue(
      RHYTHM_DEFAULT_ENABLED_KINDS.map((kind) => ({ kind, enabled: true })),
    );

    const res = await ensureDefaultRhythmSubscriptions("user-1");

    expect(res.inserted).toEqual([]);
    expect(upsertCatalogSubscription).not.toHaveBeenCalled();
  });
});

describe("ensureDefaultRhythmSubscriptionsOncePerDay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertCatalogSubscription.mockResolvedValue({ ok: true, data: {} });
    listAllSubscriptions.mockResolvedValue([]);
  });

  it("reconciles when it wins the daily Redis claim", async () => {
    redisSet.mockResolvedValue("OK");

    const res = await ensureDefaultRhythmSubscriptionsOncePerDay("user-1", "2026-09-12");

    expect(res?.inserted.length).toBeGreaterThan(0);
    expect(redisSet).toHaveBeenCalledWith(
      "magnus:proactive:rhythm_seeded:user-1:2026-09-12",
      "1",
      expect.objectContaining({ nx: true }),
    );
  });

  it("skips the query entirely when already claimed today", async () => {
    redisSet.mockResolvedValue(null);

    const res = await ensureDefaultRhythmSubscriptionsOncePerDay("user-1", "2026-09-12");

    expect(res).toBeNull();
    expect(listAllSubscriptions).not.toHaveBeenCalled();
  });
});
