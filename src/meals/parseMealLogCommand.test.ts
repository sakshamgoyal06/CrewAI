import { describe, expect, it } from "vitest";

import {
  isMealCommand,
  isSlashMealCommand,
  parseMealLogCommand,
} from "./parseMealLogCommand.js";

describe("parseMealLogCommand", () => {
  it("parses /meal prefix", () => {
    const p = parseMealLogCommand("/meal 2 roti, dal, salad");
    expect(p).toEqual({
      kind: "meal",
      text: "2 roti, dal, salad",
      slot: "unspecified",
      logKind: "meal",
    });
  });

  it("strips leading log after /meal (Telegram habit)", () => {
    expect(parseMealLogCommand("/meal log 3 puri")).toEqual({
      kind: "meal",
      text: "3 puri",
      slot: "unspecified",
      logKind: "meal",
    });
  });

  it("parses /meal@BotName (Telegram)", () => {
    const p = parseMealLogCommand("/meal@MagnusBot egg curry and rice");
    expect(p).toEqual({
      kind: "meal",
      text: "egg curry and rice",
      slot: "unspecified",
      logKind: "meal",
    });
  });

  it("parses meal: and log meal:", () => {
    expect(parseMealLogCommand("meal: oats and banana")).toEqual({
      kind: "meal",
      text: "oats and banana",
      slot: "unspecified",
      logKind: "meal",
    });
    expect(parseMealLogCommand("log meal: coffee")).toEqual({
      kind: "meal",
      text: "coffee",
      slot: "unspecified",
      logKind: "meal",
    });
  });

  it("parses log breakfast/lunch/dinner/snack with slot", () => {
    expect(parseMealLogCommand("log lunch: rice and dal")).toEqual({
      kind: "meal",
      text: "rice and dal",
      slot: "lunch",
      logKind: "meal",
    });
    expect(parseMealLogCommand("log snack: protein bar")).toEqual({
      kind: "meal",
      text: "protein bar",
      slot: "snack",
      logKind: "snack",
    });
  });

  it("parses ate: and just had:", () => {
    expect(parseMealLogCommand("ate: chicken biryani")).toEqual({
      kind: "meal",
      text: "chicken biryani",
      slot: "unspecified",
      logKind: "meal",
    });
    expect(parseMealLogCommand("just had: coffee and cookie")).toEqual({
      kind: "meal",
      text: "coffee and cookie",
      slot: "unspecified",
      logKind: "meal",
    });
  });

  it("returns none for normal chat", () => {
    expect(parseMealLogCommand("I ate pizza today").kind).toBe("none");
  });

  it("isMealCommand matches explicit meal prefixes", () => {
    expect(isMealCommand("/meal rice")).toBe(true);
    expect(isMealCommand("meal: oats")).toBe(true);
    expect(isMealCommand("log lunch: dal")).toBe(true);
    expect(isMealCommand("I had rice")).toBe(false);
  });

  it("isSlashMealCommand matches only /meal (not meal: prefix)", () => {
    expect(isSlashMealCommand("/meal rice and dal")).toBe(true);
    expect(isSlashMealCommand("/meal@MyBot egg")).toBe(true);
    expect(isSlashMealCommand("meal: oats")).toBe(false);
    expect(isSlashMealCommand("log meal: coffee")).toBe(false);
    expect(isSlashMealCommand("log lunch: dal")).toBe(false);
  });
});
