import { describe, expect, it } from "vitest";

import { WindowLimiter } from "./rateLimit.js";

describe("WindowLimiter", () => {
  it("allows up to max hits per window, then blocks until the window passes", () => {
    const l = new WindowLimiter(2, 1000);
    expect(l.take("a", 0)).toBe(true);
    expect(l.take("a", 10)).toBe(true);
    expect(l.blocked("a", 20)).toBe(true);
    expect(l.take("a", 20)).toBe(false);
    expect(l.take("b", 20)).toBe(true);
    expect(l.blocked("a", 1001)).toBe(false);
    expect(l.take("a", 1001)).toBe(true);
  });

  it("prunes expired keys when full", () => {
    const l = new WindowLimiter(1, 100, 2);
    l.take("a", 0);
    l.take("b", 0);
    expect(l.take("c", 200)).toBe(true);
    expect(l.blocked("a", 200)).toBe(false);
  });
});
