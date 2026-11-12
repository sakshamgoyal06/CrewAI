import { describe, expect, it } from "vitest";

import { canSetMinimum, minimumAsks } from "./minimumDay.js";

describe("minimumAsks", () => {
  it("asks for half the protein (to 5 g) and 5,000 steps, or the step target if lower", () => {
    expect(minimumAsks({ proteinTarget: 165, stepTarget: 8000 })).toEqual({ proteinG: 85, steps: 5000 });
    expect(minimumAsks({ proteinTarget: null, stepTarget: 4000 })).toEqual({ proteinG: null, steps: 4000 });
  });
});

describe("canSetMinimum", () => {
  const today = "2026-11-14";
  it("allows today and yesterday only", () => {
    expect(canSetMinimum([], today, today)).toEqual({ ok: true });
    expect(canSetMinimum([], "2026-11-13", today)).toEqual({ ok: true });
    expect(canSetMinimum([], "2026-11-12", today)).toMatchObject({ ok: false, error: "bad_date" });
  });
  it("allows at most 2 in any 7 days", () => {
    expect(canSetMinimum(["2026-11-10"], today, today)).toEqual({ ok: true });
    expect(canSetMinimum(["2026-11-09", "2026-11-12"], today, today)).toMatchObject({ ok: false, error: "too_many", max: 2 });
    expect(canSetMinimum(["2026-11-05", "2026-11-07"], today, today)).toEqual({ ok: true });
  });
  it("is fine to set again on a day that already is one", () => {
    expect(canSetMinimum(["2026-11-12", today], today, today)).toEqual({ ok: true });
  });
});
