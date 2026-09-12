import { describe, expect, it } from "vitest";

import { inferHevyWriteIntent, parseHevyWriteCommand } from "./parseHevyWriteCommand.js";

describe("parseHevyWriteCommand", () => {
  it("parses hevy routine:", () => {
    const p = parseHevyWriteCommand("hevy routine: Leg day — squat 4x8");
    expect(p).toEqual({ kind: "routine", text: "Leg day — squat 4x8" });
  });

  it("parses hevy workout:", () => {
    const p = parseHevyWriteCommand("HEVY WORKOUT: ran 5k easy");
    expect(p).toEqual({ kind: "workout", text: "ran 5k easy" });
  });

  it("parses slash payload routine: when command was /hevy", () => {
    const p = parseHevyWriteCommand("routine: Upper — bench, row", "hevy");
    expect(p).toEqual({ kind: "routine", text: "Upper — bench, row" });
  });

  it("parses hevy routine update: uuid — plan", () => {
    const id = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";
    const p = parseHevyWriteCommand(`hevy routine update: ${id} — bench 5x5`);
    expect(p).toEqual({ kind: "routine_update", routineId: id, text: "bench 5x5" });
  });

  it("parses /hevy routine update: with slashCommandKey", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const p = parseHevyWriteCommand(`routine update: ${id} — leg day`, "hevy");
    expect(p).toEqual({ kind: "routine_update", routineId: id, text: "leg day" });
  });

  it("returns none for unrelated chat", () => {
    expect(parseHevyWriteCommand("Add this to hevy please")).toEqual({ kind: "none" });
  });
});

// Nobody types "hevy routine:" — they ask for a routine. Requiring the prefix made Magnus
// deny a capability it has and answer with textbook exercises instead.
describe("inferHevyWriteIntent", () => {
  it("still honours the explicit prefixes", () => {
    expect(inferHevyWriteIntent("hevy routine: Leg day — squat 4x8")).toEqual({
      kind: "routine",
      text: "Leg day — squat 4x8",
    });
    expect(inferHevyWriteIntent("routine: Upper — bench, row", "hevy")).toEqual({
      kind: "routine",
      text: "Upper — bench, row",
    });
  });

  it("reads a plain-language routine request as a routine create", () => {
    const asks = [
      "Create new routine for me, with a 3-2-2 exercise split. Create and add to hevy",
      "can you make me a push routine and put it in Hevy",
      "build a new upper/lower split please",
      "set up a programme for the next 4 weeks in hevy",
      "save this as a routine: bench, row, curls",
    ];
    for (const ask of asks) {
      expect(inferHevyWriteIntent(ask).kind, ask).toBe("routine");
    }
  });

  it("reads a completed session as a workout log", () => {
    const asks = [
      "log my legs workout in hevy",
      "I did chest and back today, record it in hevy",
      "just finished my session — log it",
    ];
    for (const ask of asks) {
      expect(inferHevyWriteIntent(ask).kind, ask).toBe("workout");
    }
  });

  it("picks up a routine update when a uuid is present", () => {
    const id = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";
    const parsed = inferHevyWriteIntent(`update routine ${id} to swap squats for hack squats`);
    expect(parsed).toMatchObject({ kind: "routine_update", routineId: id });
  });

  // A mis-route must not write something the user did not ask for.
  it("leaves reads and questions alone", () => {
    const reads = [
      "review my last Hevy workout",
      "how was my gym session today?",
      "should I train legs today?",
      "what routine should I do tomorrow",
      "show me my routines",
      "how much protein should I aim for?",
      "compare this week's training to last week",
    ];
    for (const read of reads) {
      expect(inferHevyWriteIntent(read).kind, read).toBe("none");
    }
  });
});
