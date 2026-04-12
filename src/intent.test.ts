import { describe, expect, it } from "vitest";

import { parseIntent } from "./intent.js";

describe("parseIntent", () => {
  it("parses explicit category words", () => {
    expect(parseIntent("focus on HEALTH today")).toBe("HEALTH");
    expect(parseIntent("WEALTH planning")).toBe("WEALTH");
  });

  it("defaults to GENERAL when no category token", () => {
    expect(parseIntent("hello there")).toBe("GENERAL");
  });
});
