import { describe, expect, it } from "vitest";

import { buildTurnContext, chatPhase, LEGACY_SYSTEM_PROMPT, legacyTurnContext, SYSTEM_PROMPT, systemPrompt } from "./chatPrompt.js";
import { FIXTURE_DETAILS, FIXTURE_NOW, fixtureSnapshot } from "./evals/fixture.js";

describe("chatPhase", () => {
  it("names the phase from the goal and the week", () => {
    expect(chatPhase(fixtureSnapshot(), FIXTURE_NOW)).toBe("steady");
    expect(chatPhase(fixtureSnapshot({ goal: null }), FIXTURE_NOW)).toBe("no_goal");
    const s = fixtureSnapshot();
    expect(chatPhase({ ...s, goal: { ...s.goal!, goal: { ...s.goal!.goal, startDate: "2026-11-01" } } }, FIXTURE_NOW)).toBe("first_week");
    expect(chatPhase({ ...s, goal: { ...s.goal!, goal: { ...s.goal!.goal, deadline: "2026-11-02" } } }, FIXTURE_NOW)).toBe("deadline_passed");
    expect(chatPhase({ ...s, northStar: { ...s.northStar, onTrackDays: 1, days: s.northStar.days.slice(0, 6) } }, FIXTURE_NOW)).toBe("off_track");
  });
});

describe("buildTurnContext", () => {
  it("gives the coach today, the week, the goal and what's open, in numbers it may quote", () => {
    const ctx = buildTurnContext(fixtureSnapshot(), FIXTURE_DETAILS, FIXTURE_NOW);
    expect(ctx).toContain("local date 2026-11-03). Phase: steady.");
    expect(ctx).toContain("About them: male, born 1996");
    expect(ctx).toContain("Goal: Weight 81.9kg → 74kg (on pace); deadline 2027-01-31, 89 days left.");
    expect(ctx).toContain("Targets: 1800 kcal, protein 120 g, 8000 steps, training days 1,3,5 (0=Sun).");
    expect(ctx).toContain("Today: 610 kcal eaten (1190 left), 28 g protein, 4200 steps, 1 meal logged, training day.");
    expect(ctx).toContain("Routine today: Morning walk done (Walking · 30 min); Gym pending (6:30 pm).");
    expect(ctx).toContain("This week: 3 of the last 7 days on track (goal 5); most missed: Protein (4 days).");
    expect(ctx).toContain("Last weigh-in: 81.9 kg on 2026-11-02, 22.8% body fat.");
    expect(ctx).not.toContain("Open check-ins");
    const later = buildTurnContext(
      fixtureSnapshot({ workoutChecks: [{ localDate: "2026-11-01", gymTime: "18:30", status: "missing", hevyWorkoutId: null, reason: null }] }),
      null,
      new Date("2026-11-03T20:00:00+05:30"),
    );
    expect(later).toContain("Open check-ins: gym on 2026-11-01");
    expect(ctx).toContain("Last Hevy workout: Push day on 2026-11-01.");
  });

  it("carries the coach's memory lines, and leaves the line out when there are none", () => {
    const lines = [{ text: "Travels Mon-Wed most weeks" }, { text: "Hates karela" }];
    expect(buildTurnContext(fixtureSnapshot(), FIXTURE_DETAILS, FIXTURE_NOW, lines)).toContain(
      "Remembered about them (they see and edit this list on the You tab): Travels Mon-Wed most weeks; Hates karela.",
    );
    expect(buildTurnContext(fixtureSnapshot(), FIXTURE_DETAILS, FIXTURE_NOW)).not.toContain("Remembered about them");
    expect(legacyTurnContext(null, FIXTURE_NOW, "Asia/Kolkata", lines)).toContain("Remembered about them");
  });

  it("says when there is no goal and no Hevy", () => {
    const ctx = buildTurnContext(fixtureSnapshot({ goal: null, hevyConnected: false, workouts: [] }), null, FIXTURE_NOW);
    expect(ctx).toContain("Phase: no_goal.");
    expect(ctx).toContain("Goal: none set yet.");
    expect(ctx).toContain("Hevy: not connected.");
    expect(ctx).not.toContain("About them");
  });
});

describe("systemPrompt", () => {
  it("is the new prompt by default and the old one behind the flag", () => {
    expect(systemPrompt({} as NodeJS.ProcessEnv)).toBe(SYSTEM_PROMPT);
    expect(systemPrompt({ MAGNUS_CHAT_PROMPT: "legacy" } as NodeJS.ProcessEnv)).toBe(LEGACY_SYSTEM_PROMPT);
  });

  it("keeps the hard rules the code can't enforce", () => {
    for (const must of ["Never say something is logged", "Only mention a card", "Never invent a number", "avoid list", "Not a doctor", "1200 kcal"]) {
      expect(SYSTEM_PROMPT).toContain(must);
    }
    expect(SYSTEM_PROMPT.length).toBeLessThan(LEGACY_SYSTEM_PROMPT.length + 2500);
  });
});
