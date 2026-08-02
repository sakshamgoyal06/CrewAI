import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("../tools/clients.js", () => ({ supabase: {}, anthropic: {}, redis: {} }));

import {
  createEvent,
  listEvents,
  rescheduleEvent,
  sweepMissedEvents,
  updateEvent,
} from "./eventStore.js";
import type { EventRow } from "./eventTypes.js";

type Result = { data: unknown; error: unknown };
type Recorded = { table: string; ops: Array<{ name: string; args: unknown[] }> };

/** Records the query that was built, and answers with queued results in await order. */
function fakeClient(results: Result[]) {
  const calls: Recorded[] = [];
  const rpc = vi.fn();
  let cursor = 0;
  const next = (): Result => results[cursor++] ?? { data: null, error: null };

  const from = (table: string): unknown => {
    const recorded: Recorded = { table, ops: [] };
    calls.push(recorded);
    const builder: unknown = new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "then") {
            const result = next();
            return (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
              Promise.resolve(result).then(resolve, reject);
          }
          return (...args: unknown[]) => {
            recorded.ops.push({ name: prop, args });
            if (prop === "single" || prop === "maybeSingle") {
              return Promise.resolve(next());
            }
            return builder;
          };
        },
      },
    );
    return builder;
  };

  return {
    deps: { client: { from, rpc } as unknown as SupabaseClient },
    calls,
    rpc,
    opArgs(table: string, op: string): unknown[] | undefined {
      for (const call of calls) {
        if (call.table !== table) {
          continue;
        }
        const found = call.ops.find((o) => o.name === op);
        if (found) {
          return found.args;
        }
      }
      return undefined;
    },
  };
}

const ROW: EventRow = {
  id: "evt-1",
  user_profile_id: "user-1",
  title: "AI session",
  details: null,
  pillar: "wisdom",
  activity_key: "ai_session",
  tags: [],
  priority: null,
  time_zone: "Asia/Kolkata",
  planned_start_at: "2026-07-31T15:30:00Z",
  planned_end_at: "2026-07-31T17:30:00Z",
  planned_minutes: 120,
  all_day: false,
  planned_date: "2026-07-31",
  planned_minute_of_day: 1260,
  planned_dow: 5,
  started_at: null,
  ended_at: null,
  actual_minutes: null,
  completed_at: null,
  start_delay_minutes: null,
  status: "planned",
  status_changed_at: "2026-07-31T10:00:00Z",
  reason: null,
  outcome_note: null,
  root_event_id: "evt-1",
  reschedule_of: null,
  rescheduled_to: null,
  reschedule_kind: null,
  reschedule_count: 0,
  remind_at: null,
  google_event_id: null,
  daily_log_id: null,
  source: "telegram",
  created_by: "magnus",
  created_at: "2026-07-31T10:00:00Z",
};

const BASE = {
  userProfileId: "user-1",
  timeZone: "Asia/Kolkata",
};

describe("createEvent", () => {
  it("normalises the row before writing it", async () => {
    const fake = fakeClient([
      { data: [], error: null }, // correction lookup
      { data: [], error: null }, // dedupe lookup
      { data: ROW, error: null }, // insert
    ]);

    const out = await createEvent(
      {
        ...BASE,
        title: "  AI session  ",
        pillar: "happiness",
        activity: "AI Session",
        plannedStartAt: new Date("2026-07-31T15:30:00Z"),
        tags: [" Deep ", ""],
      },
      fake.deps,
    );

    expect(out.ok).toBe(true);
    const [inserted] = fake.opArgs("magnus_events", "insert") as [Record<string, unknown>];
    expect(inserted.title).toBe("AI session");
    expect(inserted.pillar).toBe("wisdom");
    expect(inserted.activity_key).toBe("ai_session");
    expect(inserted.tags).toEqual(["deep"]);
    expect(inserted.planned_start_at).toBe("2026-07-31T15:30:00.000Z");
    expect(inserted.status).toBe("planned");
  });

  it("returns the open commitment instead of a twin", async () => {
    const fake = fakeClient([
      { data: [], error: null }, // correction lookup
      { data: [ROW], error: null }, // dedupe lookup
    ]);

    const out = await createEvent(
      {
        ...BASE,
        title: "AI session",
        plannedStartAt: new Date("2026-07-31T15:35:00Z"),
      },
      fake.deps,
    );

    expect(out.ok && out.data.duplicate).toBe(true);
    expect(fake.opArgs("magnus_events", "insert")).toBeUndefined();
  });

  it("refuses a second log when the time changed — use reschedule", async () => {
    const fake = fakeClient([{ data: [ROW], error: null }]);

    const out = await createEvent(
      {
        ...BASE,
        title: "AI session",
        activity: "AI session",
        plannedStartAt: new Date("2026-08-01T15:30:00Z"),
      },
      fake.deps,
    );

    expect(out).toEqual({ ok: false, error: `correction_use_reschedule:${ROW.id}` });
    expect(fake.opArgs("magnus_events", "insert")).toBeUndefined();
  });

  it("refuses an untitled event without touching the database", async () => {
    const fake = fakeClient([]);
    const out = await createEvent({ ...BASE, title: "   " }, fake.deps);
    expect(out).toEqual({ ok: false, error: "an event needs a title" });
    expect(fake.calls).toHaveLength(0);
  });

  it("still writes when the duplicate check fails", async () => {
    const fake = fakeClient([
      { data: [], error: null }, // correction lookup
      { data: null, error: { message: "timeout" } }, // dedupe lookup
      { data: ROW, error: null }, // insert
    ]);

    const out = await createEvent(
      { ...BASE, title: "AI session", plannedStartAt: new Date("2026-07-31T15:30:00Z") },
      fake.deps,
    );

    expect(out.ok).toBe(true);
    expect(fake.opArgs("magnus_events", "insert")).toBeDefined();
  });
});

describe("updateEvent", () => {
  it("sends a move back to the reschedule path", async () => {
    const fake = fakeClient([]);
    const out = await updateEvent(
      { userProfileId: "user-1", eventId: "evt-1", status: "postponed" },
      fake.deps,
    );
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.error).toContain("reschedule");
    expect(fake.calls).toHaveLength(0);
  });

  it("leaves a superseded row alone", async () => {
    const fake = fakeClient([
      { data: { ...ROW, status: "postponed", rescheduled_to: "evt-2" }, error: null },
    ]);

    const out = await updateEvent(
      { userProfileId: "user-1", eventId: "evt-1", status: "done" },
      fake.deps,
    );

    expect(out.ok).toBe(false);
    expect(out.ok === false && out.error).toContain("evt-2");
  });

  it("dates a completion that arrives without times", async () => {
    const fake = fakeClient([
      { data: ROW, error: null },
      { data: { ...ROW, status: "done" }, error: null },
    ]);

    await updateEvent(
      { userProfileId: "user-1", eventId: "evt-1", status: "done", outcomeNote: "went well" },
      fake.deps,
    );

    const [patch] = fake.opArgs("magnus_events", "update") as [Record<string, unknown>];
    expect(patch.status).toBe("done");
    expect(patch.outcome_note).toBe("went well");
    expect(patch.ended_at).toBeTypeOf("string");
    expect(patch.started_at).toBe(ROW.planned_start_at);
  });

  it("reports no event rather than writing blind", async () => {
    const fake = fakeClient([{ data: null, error: null }]);
    const out = await updateEvent(
      { userProfileId: "user-1", eventId: "missing", status: "done" },
      fake.deps,
    );
    expect(out).toEqual({ ok: false, error: "no event with that id" });
  });
});

describe("rescheduleEvent", () => {
  it("moves through the database function and returns both rows", async () => {
    const moved = { ...ROW, id: "evt-2", reschedule_of: "evt-1", reschedule_kind: "postponed" };
    const fake = fakeClient([{ data: ROW, error: null }]);
    fake.rpc.mockResolvedValue({ data: moved, error: null });

    const out = await rescheduleEvent(
      {
        userProfileId: "user-1",
        eventId: "evt-1",
        newStartAt: new Date("2026-07-31T17:30:00Z"),
        reason: "watching a film",
        timeZone: "Asia/Kolkata",
      },
      fake.deps,
    );

    expect(fake.rpc).toHaveBeenCalledWith("magnus_reschedule_event", {
      p_event_id: "evt-1",
      p_new_start: "2026-07-31T17:30:00.000Z",
      p_new_end: null,
      p_kind: null,
      p_reason: "watching a film",
      p_details: null,
      p_time_zone: "Asia/Kolkata",
      p_source: null,
    });
    expect(out.ok && out.data.next.id).toBe("evt-2");
    expect(out.ok && out.data.previous.id).toBe("evt-1");
  });

  it("reports a refusal from the database in words", async () => {
    const fake = fakeClient([{ data: { ...ROW, status: "done" }, error: null }]);
    fake.rpc.mockResolvedValue({
      data: null,
      error: { message: "event evt-1 is already complete and cannot be moved" },
    });

    const out = await rescheduleEvent(
      { userProfileId: "user-1", eventId: "evt-1", newStartAt: new Date() },
      fake.deps,
    );

    expect(out.ok).toBe(false);
    expect(out.ok === false && out.error).toContain("already complete");
  });
});

describe("listEvents", () => {
  it("applies the range and status filters", async () => {
    const fake = fakeClient([{ data: [ROW], error: null }]);

    await listEvents(
      {
        userProfileId: "user-1",
        from: new Date("2026-07-30T00:00:00Z"),
        to: new Date("2026-08-02T00:00:00Z"),
        statuses: ["planned", "missed"],
        limit: 500,
      },
      fake.deps,
    );

    expect(fake.opArgs("magnus_events", "gte")).toEqual([
      "planned_start_at",
      "2026-07-30T00:00:00.000Z",
    ]);
    expect(fake.opArgs("magnus_events", "in")).toEqual(["status", ["planned", "missed"]]);
    expect(fake.opArgs("magnus_events", "limit")).toEqual([100]);
  });
});

describe("sweepMissedEvents", () => {
  it("returns how many were written off", async () => {
    const fake = fakeClient([]);
    fake.rpc.mockResolvedValue({ data: 3, error: null });

    const out = await sweepMissedEvents({ userProfileId: "user-1" }, fake.deps);

    expect(out).toEqual({ ok: true, data: 3 });
    expect(fake.rpc).toHaveBeenCalledWith("magnus_sweep_missed_events", {
      p_user_profile_id: "user-1",
      p_grace_minutes: 180,
      p_max_age_days: 14,
    });
  });
});
