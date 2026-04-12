import { describe, expect, it } from "vitest";

import {
  getDisambiguationReply,
  parseDisambiguationChoice,
} from "./intentDisambiguation.js";

describe("getDisambiguationReply", () => {
  it("returns null for Notion override", () => {
    expect(getDisambiguationReply("log this to notion: foo")).toBeNull();
  });

  it("asks when planning and research signals both appear", () => {
    const r = getDisambiguationReply(
      "Plan my week and research competitors in CRM space",
    );
    expect(r).toContain("planning");
    expect(r).toContain("research");
  });

  it("returns null for research-only", () => {
    expect(
      getDisambiguationReply("Research scrap services in HSR Bangalore"),
    ).toBeNull();
  });

  it("greets on bare hello", () => {
    const r = getDisambiguationReply("hi");
    expect(r).toContain("Magnus");
  });
});

describe("parseDisambiguationChoice", () => {
  it("parses 1 / one / first", () => {
    expect(parseDisambiguationChoice("1")).toBe("1");
    expect(parseDisambiguationChoice("one")).toBe("1");
    expect(parseDisambiguationChoice("first.")).toBe("1");
  });

  it("parses 2 / two / second", () => {
    expect(parseDisambiguationChoice("2")).toBe("2");
    expect(parseDisambiguationChoice("two")).toBe("2");
    expect(parseDisambiguationChoice("second)")).toBe("2");
  });

  it("returns null for full sentences", () => {
    expect(parseDisambiguationChoice("research scrap in HSR")).toBeNull();
  });
});
