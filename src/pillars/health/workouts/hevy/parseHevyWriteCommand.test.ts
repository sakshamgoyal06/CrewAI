import { describe, expect, it } from "vitest";

import { parseHevyWriteCommand, resolveHevyWriteRequest } from "./parseHevyWriteCommand.js";

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

describe("resolveHevyWriteRequest", () => {
  const natural =
    "Create new routine for me, with a 3-2-2 exercise split. Only 3 routine, push, pull, and legs. Create and add to hevy";

  it("still requires a prefix when the capability was not selected", () => {
    expect(resolveHevyWriteRequest(natural, undefined)).toEqual({ kind: "none" });
  });

  it("accepts plain language once the plan parser selected hevy_write", () => {
    expect(
      resolveHevyWriteRequest(natural, undefined, { capabilitySelected: true }),
    ).toEqual({ kind: "routine", text: natural });
  });

  it("honours a workout kind hint from the plan parser", () => {
    const msg = "log yesterday's push session to hevy — bench 3x8";
    expect(
      resolveHevyWriteRequest(msg, undefined, { capabilitySelected: true, kindHint: "workout" }),
    ).toEqual({ kind: "workout", text: msg });
  });

  it("uses a routine uuid in the message for routine_update", () => {
    const id = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";
    const msg = `replace routine ${id} with bench 5x5`;
    expect(
      resolveHevyWriteRequest(msg, undefined, {
        capabilitySelected: true,
        kindHint: "routine_update",
      }),
    ).toEqual({ kind: "routine_update", routineId: id, text: msg });
  });

  it("keeps explicit prefixes winning over the capability hint", () => {
    expect(
      resolveHevyWriteRequest("hevy workout: ran 5k", undefined, { capabilitySelected: true }),
    ).toEqual({ kind: "workout", text: "ran 5k" });
  });
});
