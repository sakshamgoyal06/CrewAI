import { describe, expect, it } from "vitest";

import { isMealCommand, parseMealLogCommand } from "./parseMealLogCommand.js";

describe("parseMealLogCommand", () => {
  it("parses /meal prefix", () => {
    const p = parseMealLogCommand("/meal 2 roti, dal, salad");
    expect(p).toEqual({ kind: "meal", text: "2 roti, dal, salad" });
  });

  it("parses /meal@BotName (Telegram)", () => {
    const p = parseMealLogCommand("/meal@MagnusBot egg curry and rice");
    expect(p).toEqual({ kind: "meal", text: "egg curry and rice" });
  });

  it("parses meal: and log meal:", () => {
    expect(parseMealLogCommand("meal: oats and banana")).toEqual({
      kind: "meal",
      text: "oats and banana",
    });
    expect(parseMealLogCommand("log meal: coffee")).toEqual({
      kind: "meal",
      text: "coffee",
    });
  });

  it("returns none for normal chat", () => {
    expect(parseMealLogCommand("I ate pizza today").kind).toBe("none");
  });

  it("isMealCommand matches only explicit meal prefixes", () => {
    expect(isMealCommand("/meal rice")).toBe(true);
    expect(isMealCommand("meal: oats")).toBe(true);
    expect(isMealCommand("I had rice")).toBe(false);
  });
});
