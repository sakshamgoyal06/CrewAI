import { afterEach, describe, expect, it } from "vitest";

import { resetMemoryConfigForTests, memoryConfig } from "./memoryConfig.js";

describe("memoryConfig", () => {
  afterEach(() => {
    resetMemoryConfigForTests();
    delete process.env.MAGNUS_MEMORY_VERBATIM_TURNS;
  });

  it("reads tunable env vars", () => {
    process.env.MAGNUS_MEMORY_VERBATIM_TURNS = "14";
    resetMemoryConfigForTests();
    expect(memoryConfig().verbatimTurnLimit).toBe(14);
    expect(memoryConfig().conversationMessagesEnabled).toBe(true);
  });
});
