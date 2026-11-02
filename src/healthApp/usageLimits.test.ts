import { beforeEach, describe, expect, it } from "vitest";

import { _resetUsage, takeUse } from "./usageLimits.js";

const env = { MAGNUS_DAILY_CHAT_LIMIT: "2" } as NodeJS.ProcessEnv;

describe("takeUse", () => {
  beforeEach(_resetUsage);

  it("caps each person per day and resets the next day", () => {
    expect(takeUse("a", "chat", "2026-11-02", env)).toBe(true);
    expect(takeUse("a", "chat", "2026-11-02", env)).toBe(true);
    expect(takeUse("a", "chat", "2026-11-02", env)).toBe(false);
    expect(takeUse("b", "chat", "2026-11-02", env)).toBe(true);
    expect(takeUse("a", "chat", "2026-11-03", env)).toBe(true);
  });

  it("treats 0 as no cap", () => {
    for (let i = 0; i < 500; i++) expect(takeUse("a", "chat", "2026-11-02", { MAGNUS_DAILY_CHAT_LIMIT: "0" } as NodeJS.ProcessEnv)).toBe(true);
  });
});
