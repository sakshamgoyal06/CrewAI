import { beforeEach, describe, expect, it, vi } from "vitest";

const redisSet = vi.fn();
const redisGet = vi.fn();
const redisDel = vi.fn();

vi.mock("./clients.js", () => ({
  redis: {
    set: (...a: unknown[]) => redisSet(...a),
    get: (...a: unknown[]) => redisGet(...a),
    del: (...a: unknown[]) => redisDel(...a),
  },
}));

import {
  clearPendingSlashCommand,
  mergePendingSlashIntoMessage,
  setPendingSlashCommand,
} from "./pendingSlashSelection.js";

describe("mergePendingSlashIntoMessage", () => {
  beforeEach(() => {
    redisSet.mockReset();
    redisGet.mockReset();
    redisDel.mockReset();
    redisGet.mockResolvedValue(null);
  });

  it("merges plain text when pending is set", async () => {
    redisGet.mockResolvedValueOnce("culture");
    const out = await mergePendingSlashIntoMessage("1", "  noir films  ");
    expect(out).toBe("/culture noir films");
    expect(redisDel).toHaveBeenCalled();
  });

  it("does not merge when a known slash command is sent", async () => {
    const out = await mergePendingSlashIntoMessage("1", "/culture");
    expect(out).toBe("/culture");
    expect(redisDel).toHaveBeenCalled();
  });

  it("clears pending when an unknown slash command is sent", async () => {
    const out = await mergePendingSlashIntoMessage("1", "/notarealcommand");
    expect(out).toBe("/notarealcommand");
    expect(redisDel).toHaveBeenCalled();
  });
});

describe("setPendingSlashCommand", () => {
  beforeEach(() => {
    redisSet.mockReset();
  });

  it("stores with TTL", async () => {
    await setPendingSlashCommand("9", "plan");
    expect(redisSet).toHaveBeenCalledWith(
      "magnus:pending_slash:9",
      "plan",
      expect.objectContaining({ ex: 600 }),
    );
  });
});

describe("clearPendingSlashCommand", () => {
  beforeEach(() => {
    redisDel.mockReset();
  });

  it("deletes key", async () => {
    await clearPendingSlashCommand("9");
    expect(redisDel).toHaveBeenCalledWith("magnus:pending_slash:9");
  });
});
