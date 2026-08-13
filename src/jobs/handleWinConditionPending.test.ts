import { beforeEach, describe, expect, it, vi } from "vitest";

const redisStore = vi.hoisted(() => new Map<string, string>());
const logDailyCheckinMock = vi.hoisted(() => vi.fn());

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

import {
  armWinConditionPendingAfterBrief,
  handleWinConditionPendingTurn,
} from "./handleWinConditionPending.js";
import { getWinConditionPending } from "./winConditionPending.js";

const USER = "user-1";

describe("handleWinConditionPendingTurn", () => {
  beforeEach(() => {
    redisStore.clear();
    logDailyCheckinMock.mockReset();
    logDailyCheckinMock.mockResolvedValue("Check-in 2026-08-13 saved.");
  });

  it("returns handled false when no pending state", async () => {
    const result = await handleWinConditionPendingTurn({
      userProfileId: USER,
      message: "Ship the PR",
    });
    expect(result.handled).toBe(false);
  });

  it("collecting → confirming on first candidate", async () => {
    await armWinConditionPendingAfterBrief(USER);
    const result = await handleWinConditionPendingTurn({
      userProfileId: USER,
      message: "Ship the PR",
    });
    expect(result.handled).toBe(true);
    if (result.handled) {
      expect(result.replyText).toContain("Ship the PR");
      expect(result.replyText).toContain("yes");
    }
    const pending = await getWinConditionPending(USER);
    expect(pending?.phase).toBe("confirming");
  });

  it("confirming + yes logs and clears pending", async () => {
    await armWinConditionPendingAfterBrief(USER);
    await handleWinConditionPendingTurn({ userProfileId: USER, message: "Ship the PR" });
    const result = await handleWinConditionPendingTurn({
      userProfileId: USER,
      message: "yes",
    });
    expect(result.handled).toBe(true);
    expect(logDailyCheckinMock).toHaveBeenCalledWith(
      expect.objectContaining({ morning_intention: "Ship the PR" }),
    );
    expect(await getWinConditionPending(USER)).toBeNull();
  });

  it("confirming + no returns to collecting", async () => {
    await armWinConditionPendingAfterBrief(USER);
    await handleWinConditionPendingTurn({ userProfileId: USER, message: "Ship the PR" });
    const result = await handleWinConditionPendingTurn({
      userProfileId: USER,
      message: "no",
    });
    expect(result.handled).toBe(true);
    const pending = await getWinConditionPending(USER);
    expect(pending?.phase).toBe("collecting");
  });

  it("decline ends the loop without logging", async () => {
    await armWinConditionPendingAfterBrief(USER);
    const result = await handleWinConditionPendingTurn({
      userProfileId: USER,
      message: "skip today's win",
    });
    expect(result.handled).toBe(true);
    expect(logDailyCheckinMock).not.toHaveBeenCalled();
    expect(await getWinConditionPending(USER)).toBeNull();
  });
});
