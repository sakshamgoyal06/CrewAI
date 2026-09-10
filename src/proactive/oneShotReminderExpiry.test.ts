import { afterEach, describe, expect, it } from "vitest";

import {
  isOneShotReminderDeliverable,
  isOneShotReminderExpired,
  oneShotReminderMaxLateHours,
} from "./oneShotReminderExpiry.js";

describe("oneShotReminderExpiry", () => {
  afterEach(() => {
    delete process.env.MAGNUS_ONE_SHOT_REMINDER_MAX_LATE_HOURS;
  });

  it("defaults to 24 hours late window", () => {
    expect(oneShotReminderMaxLateHours()).toBe(24);
  });

  it("delivers within the late window", () => {
    const at = new Date("2026-09-07T11:30:00.000Z");
    const now = new Date("2026-09-08T10:00:00.000Z");
    expect(isOneShotReminderDeliverable(at, now)).toBe(true);
    expect(isOneShotReminderExpired(at, now)).toBe(false);
  });

  it("marks expired past the late window", () => {
    const at = new Date("2026-09-07T11:30:00.000Z");
    const now = new Date("2026-09-10T03:45:00.000Z");
    expect(isOneShotReminderDeliverable(at, now)).toBe(false);
    expect(isOneShotReminderExpired(at, now)).toBe(true);
  });

  it("is not deliverable before scheduled time", () => {
    const at = new Date("2026-09-07T11:30:00.000Z");
    const now = new Date("2026-09-07T10:00:00.000Z");
    expect(isOneShotReminderDeliverable(at, now)).toBe(false);
    expect(isOneShotReminderExpired(at, now)).toBe(false);
  });
});
