import { describe, expect, it, vi } from "vitest";

vi.mock("../../../tools/clients.js", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          contains: () => ({
            order: () => ({
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        }),
      }),
    }),
  },
}));

vi.mock("../../../users/userProgramMemory.js", () => ({
  loadUserProgramMemory: vi.fn().mockResolvedValue([
    { section: "user_context", body: "Push A routine id abc." },
    { section: "recovery_routine", body: "Max 3 gym days." },
  ]),
  SECTION_HEADINGS: {
    user_context: "user-context.md",
    weekly_schedule: "weekly-schedule.md",
    program_learnings: "program-learnings.md",
    recovery_routine: "recovery-routine.md",
  },
}));

import { loadHealthReferenceBlock } from "./loadHealthReferences.js";

describe("loadHealthReferenceBlock", () => {
  it("loads program memory from Supabase into one block", async () => {
    const { block, sources } = await loadHealthReferenceBlock("user-1");
    expect(block).toContain("Health program memory");
    expect(block).toContain("Push A routine id abc");
    expect(block).toContain("Max 3 gym days");
    expect(sources).toContain("db:user_context");
    expect(sources).toContain("db:recovery_routine");
  });
});
