import { describe, expect, it } from "vitest";
// @ts-expect-error plain JS module from the PWA
import { dayTone } from "../../pwa/dayTone.js";

const TARGET = 2000;
const at = (h: number, m = 0) => h * 60 + m;
const walk = (state: string) => ({ label: "Morning walk", startTime: "07:00", durationMin: 45, gym: false, state });
const gym = (state: string) => ({ label: "Evening gym", startTime: "18:30", durationMin: 60, gym: true, state });

function day(o: { calories?: number; meals?: number; routine?: Array<Record<string, unknown>>; met?: Record<string, boolean>; score?: number }) {
  const met = { calories: false, protein: false, steps: false, routine: false, ...o.met };
  const checks = Object.entries(met).map(([id, m]) => ({ id, met: m, progress: m ? 1 : 0.3 }));
  return {
    calories: o.calories ?? 0,
    meals: Array.from({ length: o.meals ?? 0 }, () => ({})),
    routine: o.routine ?? [walk("pending"), gym("pending")],
    checks,
    onTrack: checks.every((c) => c.met),
    score: o.score ?? 40,
  };
}

describe("dayTone", () => {
  it("is gray before anything is logged, whatever the hour", () => {
    expect(dayTone(day({}), TARGET, at(9)).tone).toBe("gray");
    expect(dayTone(day({ routine: [walk("skipped"), gym("pending")] }), TARGET, at(20)).tone).toBe("gray");
  });

  it("is never red before 2 pm, even with calories over and the walk missed", () => {
    const d = day({ calories: 2400, meals: 2, routine: [walk("skipped"), gym("pending")] });
    expect(dayTone(d, TARGET, at(13, 59)).tone).toBe("yellow");
    expect(dayTone(d, TARGET, at(14)).tone).toBe("red");
  });

  it("needs both calories and routine off for red", () => {
    const calsOnly = day({ calories: 2400, meals: 2, routine: [walk("done"), gym("pending")] });
    expect(dayTone(calsOnly, TARGET, at(16)).tone).toBe("yellow");
    const routineOnly = day({ calories: 1200, meals: 2, routine: [walk("skipped"), gym("pending")] });
    expect(dayTone(routineOnly, TARGET, at(16)).tone).toBe("yellow");
  });

  it("counts eating far too little by 2 pm as calories off", () => {
    const d = day({ calories: 500, meals: 1, routine: [walk("pending"), gym("pending")] });
    expect(dayTone(d, TARGET, at(15)).tone).toBe("red"); // walk ended 7:45, an hour's grace gone
  });

  it("doesn't count an evening item as missed before its time", () => {
    const d = day({ calories: 500, meals: 1, routine: [walk("done"), gym("pending")] });
    expect(dayTone(d, TARGET, at(15)).tone).toBe("yellow");
  });

  it("judges a swapped item (walk standing in for gym) as the server resolved it", () => {
    const swapped = { label: "Evening walk (for evening gym)", startTime: "18:30", durationMin: 30, gym: false, state: "done" };
    const d = day({ calories: 1900, meals: 3, routine: [walk("done"), swapped], met: { calories: true, protein: true, steps: true, routine: true } });
    expect(dayTone(d, TARGET, at(21)).tone).toBe("green");
  });

  it("is green at 80% with nothing off, yellow when partly there", () => {
    expect(dayTone(day({ calories: 1500, meals: 2, routine: [walk("done"), gym("pending")], score: 82 }), TARGET, at(15)).tone).toBe("green");
    expect(dayTone(day({ calories: 1500, meals: 2, routine: [walk("done"), gym("pending")], score: 60 }), TARGET, at(15)).tone).toBe("yellow");
  });

  it("judges a past day by its checks", () => {
    const missed = day({ calories: 2600, meals: 3, routine: [walk("done"), gym("pending")] });
    expect(dayTone(missed, TARGET, null).tone).toBe("red");
    const ok = day({ calories: 2600, meals: 3, met: { routine: true } });
    expect(dayTone(ok, TARGET, null).tone).toBe("yellow");
  });
});
