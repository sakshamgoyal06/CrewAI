import { describe, expect, it } from "vitest";
import { timedRuleLines, type MemoryLine } from "./coachMemory.js";
import { coveredThrough, inPlanUntil, type RuleSpans } from "./memoryRules.js";

const line = (text: string, expiresOn: string | null = null): MemoryLine => ({ id: text, text, source: "coach", createdAt: "2026-11-05T00:00:00Z", expiresOn });
const spans = (food: RuleSpans["food"], training: RuleSpans["training"] = []): RuleSpans => ({ food, training });

describe("coveredThrough", () => {
  it("is null when today isn't covered", () => {
    expect(coveredThrough([{ from: "2026-11-12", until: "2026-11-20" }], "2026-11-11")).toBeNull();
  });
  it("joins back-to-back spans in any order", () => {
    const s = [
      { from: "2026-11-18", until: "2026-11-25" },
      { from: "2026-11-11", until: "2026-11-17" },
    ];
    expect(coveredThrough(s, "2026-11-11")).toBe("2026-11-25");
  });
  it("stops at a gap", () => {
    const s = [
      { from: "2026-11-11", until: "2026-11-17" },
      { from: "2026-11-19", until: "2026-11-25" },
    ];
    expect(coveredThrough(s, "2026-11-11")).toBe("2026-11-17");
  });
});

describe("inPlanUntil", () => {
  const today = "2026-11-11";
  it("marks a veg line the temporary diet already holds (5 Nov audit, finding 12)", () => {
    const l = line("Vegetarian only (no chicken or eggs) for the next 20 days; plan meals accordingly", "2026-11-25");
    expect(inPlanUntil(l, spans([{ from: "2026-11-05", until: "2026-11-25" }]), today)).toBe("2026-11-25");
  });
  it("leaves it chat-only when the diet ends before the line does", () => {
    const l = line("Vegetarian only for 20 days", "2026-11-25");
    expect(inPlanUntil(l, spans([{ from: "2026-11-05", until: "2026-11-20" }]), today)).toBeNull();
  });
  it("a travel pause to the 17th doesn't cover a gym break to the 25th", () => {
    const l = line("No gym access for 20 days (until 2026-11-25); training at home or outdoors meanwhile", "2026-11-25");
    expect(inPlanUntil(l, spans([], [{ from: "2026-11-11", until: "2026-11-17" }]), today)).toBeNull();
    expect(inPlanUntil(l, spans([], [{ from: "2026-11-11", until: "2026-11-17" }, { from: "2026-11-18", until: "2026-11-25" }]), today)).toBe("2026-11-25");
  });
  it("never for lasting lines or plain facts", () => {
    expect(inPlanUntil(line("Allergic to peanuts"), spans([{ from: "2026-11-01", until: "2026-12-31" }]), today)).toBeNull();
    expect(inPlanUntil(line("Hates karela", "2026-11-25"), spans([{ from: "2026-11-01", until: "2026-12-31" }]), today)).toBeNull();
  });
});

describe("timedRuleLines", () => {
  it("picks only time-bound lines of that rule kind", () => {
    const lines = [line("Vegetarian only till the 25th", "2026-11-25"), line("Allergic to peanuts"), line("No gym till the 25th", "2026-11-25"), line("Travelling till Sunday", "2026-11-15")];
    expect(timedRuleLines(lines, "food").map((l) => l.text)).toEqual(["Vegetarian only till the 25th"]);
    expect(timedRuleLines(lines, "training").map((l) => l.text)).toEqual(["No gym till the 25th"]);
  });
});
