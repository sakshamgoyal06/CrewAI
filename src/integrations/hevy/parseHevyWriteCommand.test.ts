import { describe, expect, it } from "vitest";

import { parseHevyWriteCommand } from "./parseHevyWriteCommand.js";

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
