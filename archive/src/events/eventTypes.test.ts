import { describe, expect, it } from "vitest";

import {
  activityKeyFor,
  inferPillarForEvent,
  normalizePillar,
  normalizeRescheduleKind,
  normalizeStatus,
} from "./eventTypes.js";

describe("normalizePillar", () => {
  it("maps the words a person uses onto the four pillars", () => {
    expect(normalizePillar("happiness")).toBe("joy");
    expect(normalizePillar("Fitness")).toBe("health");
    expect(normalizePillar("money")).toBe("wealth");
    expect(normalizePillar("learning")).toBe("wisdom");
  });

  it("falls back to magnus rather than failing the write", () => {
    expect(normalizePillar("errands")).toBe("magnus");
    expect(normalizePillar(undefined)).toBe("magnus");
  });
});

describe("normalizeStatus", () => {
  it("accepts the model's phrasing", () => {
    expect(normalizeStatus("finished")).toBe("done");
    expect(normalizeStatus("In Progress")).toBe("in_progress");
    expect(normalizeStatus("in-progress")).toBe("in_progress");
    expect(normalizeStatus("forgot")).toBe("missed");
    expect(normalizeStatus("pushed")).toBe("postponed");
  });

  it("returns null for something it does not recognise", () => {
    expect(normalizeStatus("vibing")).toBeNull();
    expect(normalizeStatus("")).toBeNull();
  });
});

describe("normalizeRescheduleKind", () => {
  it("only accepts the three kinds of move", () => {
    expect(normalizeRescheduleKind("prepone")).toBe("preponed");
    expect(normalizeRescheduleKind("delayed")).toBe("postponed");
    expect(normalizeRescheduleKind("moved")).toBe("rescheduled");
    expect(normalizeRescheduleKind("done")).toBeNull();
  });
});

describe("inferPillarForEvent", () => {
  it("classifies AI sessions as wisdom even when the model says wealth", () => {
    expect(
      inferPillarForEvent({
        explicitPillar: "wealth",
        title: "AI session",
        activity: "ai session",
      }),
    ).toBe("wisdom");
  });

  it("keeps an explicit non-generic pillar when content is ambiguous", () => {
    expect(
      inferPillarForEvent({
        explicitPillar: "wealth",
        title: "Budget review",
      }),
    ).toBe("wealth");
  });
});

describe("activityKeyFor", () => {
  it("groups the same thing under one slug", () => {
    expect(activityKeyFor({ title: "AI Session" })).toBe("ai_session");
    expect(activityKeyFor({ activity: "AI session", title: "Deep work on Magnus" })).toBe(
      "ai_session",
    );
    expect(activityKeyFor({ title: "Gym — push day" })).toBe("gym_push_day");
    expect(activityKeyFor({ title: "The gym" })).toBe("gym");
  });

  it("keeps the words when stripping filler would leave nothing", () => {
    expect(activityKeyFor({ title: "The" })).toBe("the");
    expect(activityKeyFor({ title: "  " })).toBeNull();
  });
});
