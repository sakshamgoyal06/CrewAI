import { beforeEach, describe, expect, it, vi } from "vitest";

type Recorded = { table: string; ops: [string, unknown[]][] };

const state = vi.hoisted(() => {
  const queue: unknown[] = [];
  const recorded: { table: string; ops: [string, unknown[]][] }[] = [];
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  return { queue, recorded, rpcCalls };
});

/** Records what the store asked for, and replays whatever the test queued up. */
vi.mock("../tools/clients.js", () => {
  const next = (): unknown => state.queue.shift() ?? { data: null, error: null };
  return {
    supabase: {
      from(table: string) {
        const entry: Recorded = { table, ops: [] };
        state.recorded.push(entry);
        const builder: unknown = new Proxy(
          {},
          {
            get(_target, prop) {
              if (typeof prop !== "string") {
                return undefined;
              }
              if (prop === "then") {
                const result = next();
                return (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
              }
              return (...args: unknown[]) => {
                entry.ops.push([prop, args]);
                return builder;
              };
            },
          },
        );
        return builder;
      },
      rpc(fn: string, args: Record<string, unknown>) {
        state.rpcCalls.push({ fn, args });
        return Promise.resolve(next());
      },
    },
    anthropic: {},
    redis: {},
  };
});

import {
  deleteMagnusEvent,
  describeEventError,
  listMagnusEvents,
  markMissedMagnusEvents,
  recordMagnusEvent,
  rescheduleMagnusEvent,
  updateMagnusEventStatus,
} from "./eventsStore.js";

const USER = "00000000-0000-0000-0000-000000000001";

function opsFor(index: number): Record<string, unknown[]> {
  const entry = state.recorded[index];
  const out: Record<string, unknown[]> = {};
  for (const [name, args] of entry?.ops ?? []) {
    out[name] = args;
  }
  return out;
}

function allOps(index: number): [string, unknown[]][] {
  return state.recorded[index]?.ops ?? [];
}

const row = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "evt-1",
  user_profile_id: USER,
  title: "AI session",
  status: "planned",
  planned_start_at: "2026-08-01T15:30:00.000Z",
  reschedule_count: 0,
  root_event_id: "evt-1",
  deleted_at: null,
  ...over,
});

beforeEach(() => {
  state.queue.length = 0;
  state.recorded.length = 0;
  state.rpcCalls.length = 0;
});

describe("recordMagnusEvent", () => {
  it("writes the row Postgres expects", async () => {
    state.queue.push({ data: row(), error: null });

    const out = await recordMagnusEvent({
      userProfileId: USER,
      title: "  AI session  ",
      details: "Deep work",
      pillar: "wisdom",
      timeZone: "Asia/Kolkata",
      plannedStartAt: new Date("2026-08-01T15:30:00.000Z"),
      plannedEndAt: new Date("2026-08-01T17:00:00.000Z"),
      tags: [" Focus ", ""],
    });

    expect(out.ok).toBe(true);
    const insert = opsFor(0).insert?.[0] as Record<string, unknown>;
    expect(insert.title).toBe("AI session");
    expect(insert.user_profile_id).toBe(USER);
    expect(insert.pillar).toBe("wisdom");
    expect(insert.time_zone).toBe("Asia/Kolkata");
    expect(insert.planned_start_at).toBe("2026-08-01T15:30:00.000Z");
    expect(insert.tags).toEqual(["focus"]);
    expect(insert.status).toBe("planned");
  });

  it("refuses a blank title before touching the database", async () => {
    const out = await recordMagnusEvent({ userProfileId: USER, title: "   ", timeZone: "UTC" });
    expect(out).toEqual({ ok: false, error: "an event needs a title" });
    expect(state.recorded).toHaveLength(0);
  });

  it("explains a duplicate rather than repeating the constraint name", async () => {
    state.queue.push({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "uq_magnus_events_open_duplicate"' },
    });
    const out = await recordMagnusEvent({ userProfileId: USER, title: "Gym", timeZone: "UTC" });
    expect(out).toEqual({
      ok: false,
      error: "there is already an open event with that title at that time",
    });
  });
});

describe("listMagnusEvents", () => {
  it("scopes to the user, skips deleted rows, and bounds the window", async () => {
    state.queue.push({ data: [row()], error: null });

    await listMagnusEvents({
      userProfileId: USER,
      from: new Date("2026-08-01T00:00:00.000Z"),
      to: new Date("2026-08-02T00:00:00.000Z"),
      openOnly: true,
      limit: 10,
    });

    const ops = opsFor(0);
    expect(ops.eq).toEqual(["user_profile_id", USER]);
    expect(ops.is).toEqual(["deleted_at", null]);
    expect(ops.in).toEqual(["status", ["planned", "in_progress"]]);
    expect(ops.gte).toEqual(["planned_start_at", "2026-08-01T00:00:00.000Z"]);
    expect(ops.lt).toEqual(["planned_start_at", "2026-08-02T00:00:00.000Z"]);
    expect(ops.limit).toEqual([10]);
  });

  it("pulls untimed backlog items in alongside a window when asked", async () => {
    state.queue.push({ data: [], error: null });

    await listMagnusEvents({
      userProfileId: USER,
      from: new Date("2026-08-01T00:00:00.000Z"),
      to: new Date("2026-08-02T00:00:00.000Z"),
      includeUnscheduled: true,
    });

    expect(opsFor(0).or?.[0]).toBe(
      "and(planned_start_at.gte.2026-08-01T00:00:00.000Z,planned_start_at.lt.2026-08-02T00:00:00.000Z),planned_start_at.is.null",
    );
    expect(opsFor(0).gte).toBeUndefined();
  });

  it("strips PostgREST syntax out of a free-text search", async () => {
    state.queue.push({ data: [], error: null });
    await listMagnusEvents({ userProfileId: USER, query: "gym,(morning)*" });
    expect(opsFor(0).ilike).toEqual(["title", "%gym  morning  %"]);
  });

  it("caps the page size", async () => {
    state.queue.push({ data: [], error: null });
    await listMagnusEvents({ userProfileId: USER, limit: 5000 });
    expect(opsFor(0).limit).toEqual([200]);
  });

  it("says the table is missing rather than returning an empty day", async () => {
    state.queue.push({ data: null, error: { code: "42P01", message: "relation does not exist" } });
    const out = await listMagnusEvents({ userProfileId: USER });
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.error).toContain("20260801120000_magnus_events.sql");
  });
});

describe("updateMagnusEventStatus", () => {
  it("only ever updates the caller's own row", async () => {
    state.queue.push({ data: row({ status: "done" }), error: null });

    const out = await updateMagnusEventStatus({
      userProfileId: USER,
      eventId: "evt-1",
      status: "done",
      outcomeNote: "Went well",
    });

    expect(out.ok).toBe(true);
    const eqCalls = allOps(0).filter(([name]) => name === "eq");
    expect(eqCalls).toEqual([
      ["eq", ["user_profile_id", USER]],
      ["eq", ["id", "evt-1"]],
    ]);
    const patch = opsFor(0).update?.[0] as Record<string, unknown>;
    expect(patch).toEqual({ status: "done", outcome_note: "Went well" });
  });

  it("reports a miss instead of pretending it worked", async () => {
    state.queue.push({ data: null, error: null });
    const out = await updateMagnusEventStatus({
      userProfileId: USER,
      eventId: "nope",
      status: "done",
    });
    expect(out).toEqual({ ok: false, error: "no such event" });
  });
});

describe("rescheduleMagnusEvent", () => {
  it("goes through the database function and reads the replacement back", async () => {
    state.queue.push({ data: row(), error: null });
    state.queue.push({ data: "evt-2", error: null });
    state.queue.push({
      data: row({ id: "evt-2", reschedule_count: 1, rescheduled_from_event_id: "evt-1" }),
      error: null,
    });

    const out = await rescheduleMagnusEvent({
      userProfileId: USER,
      eventId: "evt-1",
      newStartAt: new Date("2026-08-01T17:30:00.000Z"),
      reason: "Dinner ran long",
    });

    expect(out.ok).toBe(true);
    expect(out.ok === true && out.event.id).toBe("evt-2");
    expect(out.ok === true && out.previous.id).toBe("evt-1");
    expect(state.rpcCalls[0]).toEqual({
      fn: "magnus_reschedule_event",
      args: {
        p_event_id: "evt-1",
        p_new_start: "2026-08-01T17:30:00.000Z",
        p_new_end: null,
        p_reason: "Dinner ran long",
        p_displaced_by_event_id: null,
      },
    });
  });

  it("will not move an event the user does not own", async () => {
    state.queue.push({ data: null, error: null });
    const out = await rescheduleMagnusEvent({
      userProfileId: USER,
      eventId: "someone-elses",
      newStartAt: new Date(),
    });
    expect(out).toEqual({ ok: false, error: "no such event" });
    expect(state.rpcCalls).toHaveLength(0);
  });

  it("passes the reason for a refusal straight through", async () => {
    state.queue.push({ data: row(), error: null });
    state.queue.push({
      data: null,
      error: { message: "magnus_reschedule_event: event evt-1 was already moved to evt-9" },
    });
    const out = await rescheduleMagnusEvent({
      userProfileId: USER,
      eventId: "evt-1",
      newStartAt: new Date("2026-08-02T10:00:00.000Z"),
    });
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.error).toContain("already moved");
  });
});

describe("deleteMagnusEvent", () => {
  it("soft deletes so the chain survives", async () => {
    state.queue.push({ data: null, error: null });
    const out = await deleteMagnusEvent(USER, "evt-1");
    expect(out.ok).toBe(true);
    const patch = opsFor(0).update?.[0] as Record<string, unknown>;
    expect(Object.keys(patch)).toEqual(["deleted_at"]);
  });
});

describe("markMissedMagnusEvents", () => {
  it("sweeps one user with a grace window", async () => {
    state.queue.push({ data: 3, error: null });
    const count = await markMissedMagnusEvents(USER, 4);
    expect(count).toBe(3);
    expect(state.rpcCalls[0]).toEqual({
      fn: "magnus_mark_missed_events",
      args: { p_user_profile_id: USER, p_grace: "4 hours" },
    });
  });

  it("counts nothing when the sweep fails", async () => {
    state.queue.push({ data: null, error: { message: "boom" } });
    expect(await markMissedMagnusEvents(USER)).toBe(0);
  });
});

describe("describeEventError", () => {
  it("turns constraint names into something worth reading", () => {
    expect(describeEventError({ message: "…uq_magnus_events_chain_predecessor…" })).toBe(
      "that event has already been moved once",
    );
    expect(describeEventError({ message: "…chk_magnus_events_planned_order…" })).toBe(
      "the end time is before the start time",
    );
    expect(describeEventError({ code: "PGRST202", message: "no function" })).toContain(
      "reschedule function is missing",
    );
    expect(describeEventError({ message: "connection reset" })).toBe("connection reset");
  });
});
