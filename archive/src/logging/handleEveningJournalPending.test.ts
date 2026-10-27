import { beforeEach, describe, expect, it, vi } from "vitest";

const redisStore = vi.hoisted(() => new Map<string, string>());
const logDailyCheckinMock = vi.hoisted(() => vi.fn());
const loadDailyLogStatusMock = vi.hoisted(() => vi.fn());

vi.mock("../tools/clients.js", () => ({
  redis: {
    get: vi.fn(async (k: string) => redisStore.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => {
      redisStore.set(k, v);
      return "OK";
    }),
    del: vi.fn(async (k: string) => {
      redisStore.delete(k);
    }),
  },
}));

vi.mock("../lists/listService.js", () => ({
  logDailyCheckin: logDailyCheckinMock,
}));

vi.mock("./dailyLogStatus.js", () => ({
  loadDailyLogStatus: loadDailyLogStatusMock,
}));

import {
  armEveningJournalPendingAfterNudge,
  handleEveningJournalPendingTurn,
} from "./handleEveningJournalPending.js";
import { getEveningJournalPending } from "./eveningJournalPending.js";
import {
  eveningDraftIsSubstantive,
  parseEveningDraftFromMessage,
} from "./parseEveningDraft.js";

const USER = "user-1";
const DATE = "2026-09-08";

describe("parseEveningDraftFromMessage", () => {
  it("extracts rating, joy, and notes", () => {
    const draft = parseEveningDraftFromMessage("7/10 — productive day, joy 72");
    expect(draft.day_rating).toBe(7);
    expect(draft.joy_score).toBe(72);
    expect(draft.notes).toContain("productive");
  });

  it("treats substantive drafts correctly", () => {
    expect(eveningDraftIsSubstantive({ day_rating: 8 })).toBe(true);
    expect(eveningDraftIsSubstantive({ notes: "short" })).toBe(false);
    expect(eveningDraftIsSubstantive({ notes: "long enough reflection" })).toBe(true);
  });
});

describe("handleEveningJournalPendingTurn", () => {
  beforeEach(() => {
    redisStore.clear();
    logDailyCheckinMock.mockReset();
    loadDailyLogStatusMock.mockReset();
    loadDailyLogStatusMock.mockResolvedValue({
      dateKey: DATE,
      hasEveningReflection: false,
      declinedEvening: false,
    });
    logDailyCheckinMock.mockResolvedValue(`Logged daily check-in for ${DATE} (id:abc).`);
  });

  it("returns handled false when no pending state", async () => {
    const result = await handleEveningJournalPendingTurn({
      userProfileId: USER,
      message: "hello",
      dateKey: DATE,
    });
    expect(result.handled).toBe(false);
  });

  it("arms after nudge when evening not logged", async () => {
    await armEveningJournalPendingAfterNudge(USER, DATE);
    const pending = await getEveningJournalPending(USER);
    expect(pending?.phase).toBe("awaiting_engagement");
  });

  it("collecting → confirming on substantive reply", async () => {
    await armEveningJournalPendingAfterNudge(USER, DATE);
    const result = await handleEveningJournalPendingTurn({
      userProfileId: USER,
      message: "8/10 felt calm, shipped the logging framework",
      dateKey: DATE,
    });
    expect(result.handled).toBe(true);
    const pending = await getEveningJournalPending(USER);
    expect(pending?.phase).toBe("confirming");
  });

  it("confirming + yes logs and clears pending", async () => {
    await armEveningJournalPendingAfterNudge(USER, DATE);
    await handleEveningJournalPendingTurn({
      userProfileId: USER,
      message: "7/10 good day, finished the PR",
      dateKey: DATE,
    });
    const result = await handleEveningJournalPendingTurn({
      userProfileId: USER,
      message: "yes",
      dateKey: DATE,
    });
    expect(result.handled).toBe(true);
    expect(logDailyCheckinMock).toHaveBeenCalledWith(
      expect.objectContaining({
        day_rating: 7,
        notes: expect.stringContaining("finished the PR"),
        append_notes: true,
      }),
    );
    expect(await getEveningJournalPending(USER)).toBeNull();
  });

  it("decline ends the loop without logging", async () => {
    await armEveningJournalPendingAfterNudge(USER, DATE);
    const result = await handleEveningJournalPendingTurn({
      userProfileId: USER,
      message: "skip tonight",
      dateKey: DATE,
    });
    expect(result.handled).toBe(true);
    expect(logDailyCheckinMock).not.toHaveBeenCalled();
    expect(await getEveningJournalPending(USER)).toBeNull();
  });
});
