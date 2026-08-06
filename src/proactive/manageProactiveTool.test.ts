import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./subscriptions/store.js", () => ({
  listAllSubscriptions: vi.fn(),
  upsertCatalogSubscription: vi.fn(),
  createCustomReminder: vi.fn(),
  setSubscriptionEnabled: vi.fn(),
  deleteSubscription: vi.fn(),
}));

import {
  createCustomReminder,
  listAllSubscriptions,
  upsertCatalogSubscription,
} from "./subscriptions/store.js";
import { manageProactiveMessages } from "./manageProactiveTool.js";

describe("manageProactiveMessages", () => {
  beforeEach(() => {
    vi.mocked(listAllSubscriptions).mockResolvedValue([]);
  });

  it("lists subscriptions", async () => {
    vi.mocked(listAllSubscriptions).mockResolvedValue([
      {
        id: "abc-123",
        userProfileId: "u1",
        kind: "evening_journal",
        enabled: true,
        triggerType: "recurring",
        schedule: { type: "recurring_local", localHour: 21 },
        config: {},
        userInstruction: null,
        source: "user_chat",
        capBucket: "scheduled",
        cooldownHours: null,
        lastSentAt: null,
        nextFireAt: null,
        createdAt: "",
        updatedAt: "",
      },
    ]);

    const out = await manageProactiveMessages({
      userProfileId: "u1",
      timezone: "UTC",
      action: "list",
    });
    expect(out).toContain("evening_journal");
    expect(out).toContain("on");
  });

  it("enables evening journal catalog kind", async () => {
    vi.mocked(upsertCatalogSubscription).mockResolvedValue({
      ok: true,
      data: {
        id: "x",
        userProfileId: "u1",
        kind: "evening_journal",
        enabled: true,
        triggerType: "recurring",
        schedule: { type: "recurring_local", localHour: 21 },
        config: {},
        userInstruction: null,
        source: "user_chat",
        capBucket: "scheduled",
        cooldownHours: null,
        lastSentAt: null,
        nextFireAt: null,
        createdAt: "",
        updatedAt: "",
      },
    });

    const out = await manageProactiveMessages({
      userProfileId: "u1",
      timezone: "UTC",
      action: "enable",
      kind: "evening_journal",
      local_hour: 21,
    });
    expect(out).toContain("Enabled");
    expect(upsertCatalogSubscription).toHaveBeenCalled();
  });

  it("creates custom reminder", async () => {
    vi.mocked(createCustomReminder).mockResolvedValue({
      ok: true,
      data: {
        id: "r1",
        userProfileId: "u1",
        kind: "custom_reminder",
        enabled: true,
        triggerType: "one_shot",
        schedule: { type: "one_shot", at: "2026-08-07T20:00:00.000Z" },
        config: { message: "Call mom" },
        userInstruction: "Call mom",
        source: "user_chat",
        capBucket: "user_asked",
        cooldownHours: null,
        lastSentAt: null,
        nextFireAt: "2026-08-07T20:00:00.000Z",
        createdAt: "",
        updatedAt: "",
      },
    });

    const out = await manageProactiveMessages({
      userProfileId: "u1",
      timezone: "Asia/Kolkata",
      action: "create_reminder",
      message: "Call mom",
      at: "2026-08-07T20:00:00",
    });
    expect(out).toContain("Reminder set");
    expect(createCustomReminder).toHaveBeenCalled();
  });
});
