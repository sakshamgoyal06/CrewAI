import { describe, expect, it } from "vitest";

import { extractJsonObject } from "./jsonExtract.js";

describe("extractJsonObject", () => {
  it("parses first object with strings in braces", () => {
    const o = extractJsonObject('noise {"a":1,"b":"}"} tail');
    expect(o).toEqual({ a: 1, b: "}" });
  });

  it("returns null on invalid json", () => {
    expect(extractJsonObject("{ no")).toBeNull();
  });
});
