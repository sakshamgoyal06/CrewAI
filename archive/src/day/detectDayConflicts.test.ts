import { describe, expect, it } from "vitest";

import {
  detectDayConflicts,
  formatDayConflicts,
  looksLikeSameActivity,
} from "./detectDayConflicts.js";

describe("looksLikeSameActivity", () => {
  it("sees through padding words", () => {
    expect(looksLikeSameActivity("Swimming", "Morning Swimming")).toBe(true);
    expect(looksLikeSameActivity("Gym session", "Gym")).toBe(true);
    expect(looksLikeSameActivity("Physio appointment", "physio")).toBe(true);
  });

  it("keeps genuinely different activities apart", () => {
    expect(looksLikeSameActivity("Swimming", "Standup")).toBe(false);
    expect(looksLikeSameActivity("Dentist", "Gym")).toBe(false);
    expect(looksLikeSameActivity("Morning", "Evening")).toBe(false);
  });
});

describe("detectDayConflicts", () => {
  // The real brief: two overlapping swim sessions read out as two flat facts.
  it("flags the same session entered twice", () => {
    const conflicts = detectDayConflicts(
      [
        {
          id: "a",
          title: "Swimming",
          start: "2026-09-12T03:30:00.000Z",
          end: "2026-09-12T04:20:00.000Z",
        },
        {
          id: "b",
          title: "Morning Swimming",
          start: "2026-09-12T04:30:00.000Z",
          end: "2026-09-12T05:20:00.000Z",
        },
      ],
      "Asia/Kolkata",
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.kind).toBe("duplicate");
    expect(formatDayConflicts(conflicts)).toContain("same session entered twice");
    expect(formatDayConflicts(conflicts)).toContain("09:00");
    expect(formatDayConflicts(conflicts)).toContain("10:00");
  });

  it("flags a real double-booking between different activities", () => {
    const conflicts = detectDayConflicts(
      [
        {
          id: "a",
          title: "Dentist",
          start: "2026-09-12T09:00:00.000Z",
          end: "2026-09-12T10:00:00.000Z",
        },
        {
          id: "b",
          title: "Client call",
          start: "2026-09-12T09:30:00.000Z",
          end: "2026-09-12T10:30:00.000Z",
        },
      ],
      "UTC",
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.kind).toBe("overlap");
    expect(formatDayConflicts(conflicts)).toContain("double-booking");
  });

  it("leaves a clean day alone", () => {
    const conflicts = detectDayConflicts(
      [
        {
          id: "a",
          title: "Swimming",
          start: "2026-09-12T03:30:00.000Z",
          end: "2026-09-12T04:20:00.000Z",
        },
        {
          id: "b",
          title: "Standup",
          start: "2026-09-12T05:00:00.000Z",
          end: "2026-09-12T05:15:00.000Z",
        },
      ],
      "UTC",
    );

    expect(conflicts).toEqual([]);
    expect(formatDayConflicts(conflicts)).toBe("");
  });

  it("ignores all-day entries, which cannot double-book a time", () => {
    const conflicts = detectDayConflicts(
      [
        { id: "a", title: "Holiday", start: "2026-09-12" },
        { id: "b", title: "Holiday", start: "2026-09-12" },
      ],
      "UTC",
    );

    expect(conflicts).toEqual([]);
  });

  it("does not compare an event with itself", () => {
    const event = {
      id: "a",
      title: "Swimming",
      start: "2026-09-12T03:30:00.000Z",
      end: "2026-09-12T04:20:00.000Z",
    };
    expect(detectDayConflicts([event, { ...event }], "UTC")).toEqual([]);
  });

  it("treats a missing end time as a short block rather than an all-day clash", () => {
    const conflicts = detectDayConflicts(
      [
        { id: "a", title: "Call Ravi", start: "2026-09-12T09:00:00.000Z" },
        { id: "b", title: "Standup", start: "2026-09-12T09:10:00.000Z" },
      ],
      "UTC",
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.kind).toBe("overlap");
  });
});
