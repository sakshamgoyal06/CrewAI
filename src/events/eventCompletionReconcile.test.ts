import { describe, expect, it } from "vitest";

import {
  EVENT_COMPLETION_RULES,
  findCompletionMatches,
} from "./eventCompletionReconcile.js";
import type { EventRow } from "./eventTypes.js";

function row(partial: Partial<EventRow> & Pick<EventRow, "id" | "title" | "status">): EventRow {
  return {
    user_profile_id: "u1",
    details: null,
    pillar: "magnus",
    activity_key: null,
    tags: null,
    priority: null,
    time_zone: "Asia/Kolkata",
    planned_start_at: null,
    planned_end_at: null,
    planned_minutes: null,
    all_day: false,
    planned_date: null,
    planned_minute_of_day: null,
    planned_dow: null,
    started_at: null,
    ended_at: null,
    actual_minutes: null,
    completed_at: null,
    start_delay_minutes: null,
    status_changed_at: new Date().toISOString(),
    reason: null,
    outcome_note: null,
    root_event_id: partial.id,
    reschedule_of: null,
    rescheduled_to: null,
    reschedule_kind: null,
    reschedule_count: 0,
    remind_at: null,
    google_event_id: null,
    daily_log_id: null,
    source: "telegram",
    created_by: "magnus",
    created_at: new Date().toISOString(),
    ...partial,
  };
}

describe("findCompletionMatches", () => {
  const events = [
    row({
      id: "drop",
      title: "Drop bike for servicing",
      status: "missed",
    }),
    row({
      id: "pickup",
      title: "Bike pickup",
      status: "planned",
    }),
  ];

  it("matches drop but not pickup when pickup is still pending", () => {
    const matches = findCompletionMatches(
      "I dropped the bike, but haven't picked it up",
      events,
      EVENT_COMPLETION_RULES,
    );
    expect(matches.map((m) => m.eventId)).toEqual(["drop"]);
  });

  it("matches pickup when user reports it done", () => {
    const matches = findCompletionMatches("I picked up bike yesterday", events);
    expect(matches.map((m) => m.eventId)).toContain("pickup");
  });

  it("matches both when full cycle reported", () => {
    const matches = findCompletionMatches(
      "Bike picked up — servicing done, bike back home.",
      events,
    );
    expect(matches.map((m) => m.eventId).sort()).toEqual(["drop", "pickup"]);
  });

  it("skips already-done events", () => {
    const done = [
      row({ id: "pickup", title: "Bike pickup", status: "done" }),
    ];
    const matches = findCompletionMatches("picked up the bike", done);
    expect(matches).toHaveLength(0);
  });
});
