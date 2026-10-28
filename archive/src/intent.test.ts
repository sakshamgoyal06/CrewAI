import { describe, expect, it } from "vitest";

import { INTENTS, parseIntent } from "./intent.js";

describe("parseIntent", () => {
  it("parses each category name the classifier can return", () => {
    for (const intent of INTENTS) {
      expect(parseIntent(intent)).toBe(intent);
      expect(parseIntent(`the answer is ${intent} today`)).toBe(intent);
    }
  });

  it("defaults to GENERAL when no category token is present", () => {
    expect(parseIntent("hello there")).toBe("GENERAL");
    expect(parseIntent("")).toBe("GENERAL");
  });

  it("covers exactly the four pillars plus Magnus", () => {
    expect([...INTENTS]).toEqual(["HEALTH", "WEALTH", "HAPPINESS", "WISDOM", "GENERAL"]);
  });
});
