import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ gte: async () => ({ count: 98, error: null }) }) }) }) }) },
}));
vi.mock("./events.js", () => ({ enqueueEvents: vi.fn() }));

import { enqueueEvents } from "./events.js";
import { _resetLookups, countLookup, lookupsLeft, monthOf, webGateFor, webLookupLimit } from "./webLookups.js";

beforeEach(() => _resetLookups());

describe("web lookup cap", () => {
  it("defaults to 100 a month; 0 removes the cap", () => {
    expect(webLookupLimit({})).toBe(100);
    expect(webLookupLimit({ MAGNUS_WEB_LOOKUPS_PER_MONTH: "40" })).toBe(40);
    expect(lookupsLeft("u", "2026-11", { MAGNUS_WEB_LOOKUPS_PER_MONTH: "0" })).toBe(Number.POSITIVE_INFINITY);
  });

  it("counts per month and logs each lookup", () => {
    for (let i = 0; i < 100; i++) countLookup("u", "2026-11");
    expect(lookupsLeft("u", "2026-11", {})).toBe(0);
    expect(lookupsLeft("u", "2026-12", {})).toBe(100);
    expect(enqueueEvents).toHaveBeenCalledWith([expect.objectContaining({ kind: "web_lookup" })]);
    expect(monthOf("2026-11-04")).toBe("2026-11");
  });

  it("starts the month from logged lookups, then closes at the cap", async () => {
    const now = new Date("2026-11-04T10:00:00Z");
    const gate = await webGateFor("u", "Asia/Kolkata", now);
    expect(gate).toMatchObject({ allowed: true, left: 2 });
    gate.onLookup();
    gate.onLookup();
    expect((await webGateFor("u", "Asia/Kolkata", now)).allowed).toBe(false);
  });
});
