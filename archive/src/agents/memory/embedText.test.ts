import { describe, expect, it } from "vitest";

import { fixtureEmbedText, hashEmbedText, normalizeVector } from "./embedText.js";
import { isDecisionTurn } from "./memoryEmbeddings.js";

describe("embedText", () => {
  it("hash embed is normalized", () => {
    const v = hashEmbedText("hello world", 16);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("fixture embed maps job search query and chunk to same bucket", () => {
    const dim = 384;
    const a = fixtureEmbedText("what did we decide about the job search?", dim);
    const b = fixtureEmbedText("Decision: focus the job search on ML roles.", dim);
    const c = fixtureEmbedText("Bali trip flights in October.", dim);
    let dotAb = 0;
    for (let i = 0; i < dim; i++) {
      dotAb += (a[i] ?? 0) * (b[i] ?? 0);
    }
    let dotAc = 0;
    for (let i = 0; i < dim; i++) {
      dotAc += (a[i] ?? 0) * (c[i] ?? 0);
    }
    expect(dotAb).toBeGreaterThan(dotAc);
  });
});

describe("isDecisionTurn", () => {
  it("detects decision language", () => {
    expect(isDecisionTurn("Let's go with option B", "Sounds good.")).toBe(true);
    expect(isDecisionTurn("what's on my calendar?", "Here is your schedule.")).toBe(false);
  });
});

describe("normalizeVector", () => {
  it("handles zero vector", () => {
    expect(normalizeVector([0, 0, 0])).toEqual([0, 0, 0]);
  });
});
