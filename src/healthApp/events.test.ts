import { beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn(async () => ({ error: null }));
const lt = vi.fn(async () => ({ error: null }));
vi.mock("../tools/clients.js", () => ({
  supabase: { from: () => ({ insert, delete: () => ({ lt }) }) },
  redis: {},
  anthropic: {},
}));

import { _pendingEvents, clientEventsInput, clientRows, enqueueEvents, flushEvents, recordServerRoute } from "./events.js";

const USER = "73365666-4285-42af-a59e-43ba68ea65c0";

describe("health app events", () => {
  beforeEach(async () => {
    await flushEvents();
    insert.mockClear();
  });

  it("maps a client batch to rows, clamping durations and big props", () => {
    const now = Date.parse("2026-11-01T16:00:00Z");
    const input = clientEventsInput.parse({
      sessionId: "s1",
      appVersion: "v7",
      events: [
        { kind: "api", name: "/meals/:id", durationMs: 812.6, status: 200, props: { method: "DELETE" }, at: now - 1000 },
        { kind: "error", name: "boom", props: { stack: "x".repeat(5000) }, at: 1 },
      ],
    });
    const rows = clientRows(USER, input, "Android", now);
    expect(rows[0]).toMatchObject({ source: "client", kind: "api", duration_ms: 813, status: 200, session_id: "s1", app_version: "v7", occurred_at: "2026-11-01T15:59:59.000Z" });
    // A wildly wrong device clock falls back to the server's time.
    expect(rows[1]!.occurred_at).toBe("2026-11-01T16:00:00.000Z");
    expect(Object.keys(rows[1]!.props)).toEqual(["truncated"]);
  });

  it("rejects unknown kinds and oversized batches", () => {
    expect(clientEventsInput.safeParse({ sessionId: "s", events: [{ kind: "nope" }] }).success).toBe(false);
    expect(clientEventsInput.safeParse({ sessionId: "s", events: Array.from({ length: 101 }, () => ({ kind: "tap" })) }).success).toBe(false);
  });

  it("buffers server timings and writes them in one insert", async () => {
    recordServerRoute({ userProfileId: USER, route: "POST /chat", method: "POST", path: "/chat", status: 200, durationMs: 4210.2, sessionId: "s1" });
    enqueueEvents(clientRows(USER, clientEventsInput.parse({ sessionId: "s1", events: [{ kind: "tap", name: "send" }] }), undefined));
    expect(_pendingEvents()).toHaveLength(2);
    expect(insert).not.toHaveBeenCalled();
    await flushEvents();
    expect(insert).toHaveBeenCalledTimes(1);
    const rows = (insert.mock.calls[0] as unknown as [Array<Record<string, unknown>>])[0];
    expect(rows[0]).toMatchObject({ source: "server", kind: "server_route", name: "POST /chat", duration_ms: 4210, status: 200 });
    expect(_pendingEvents()).toHaveLength(0);
  });
});
