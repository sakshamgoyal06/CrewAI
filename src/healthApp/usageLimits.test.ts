import { beforeEach, describe, expect, it } from "vitest";

import { _resetUsage, needsSeed, seedUse, takeUse } from "./usageLimits.js";

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

describe("seeded counters", () => {
  it("start the day from what the database shows, so a redeploy doesn't reset the cap", () => {
    _resetUsage();
    const env = { MAGNUS_DAILY_RCA_LIMIT: "3" } as NodeJS.ProcessEnv;
    expect(needsSeed("a", "rca", "2026-11-03")).toBe(true);
    seedUse("a", "rca", "2026-11-03", 2);
    expect(needsSeed("a", "rca", "2026-11-03")).toBe(false);
    expect(takeUse("a", "rca", "2026-11-03", env)).toBe(true);
    expect(takeUse("a", "rca", "2026-11-03", env)).toBe(false);
  });

  it("keeps people in other timezones on their own day", () => {
    _resetUsage();
    const env = { MAGNUS_DAILY_CHAT_LIMIT: "1" } as NodeJS.ProcessEnv;
    expect(takeUse("us", "chat", "2026-11-02", env)).toBe(true);
    expect(takeUse("in", "chat", "2026-11-03", env)).toBe(true);
    expect(takeUse("us", "chat", "2026-11-02", env)).toBe(false);
  });
});
