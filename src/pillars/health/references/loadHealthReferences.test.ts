import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

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

import { loadHealthReferenceBlock } from "./loadHealthReferences.js";

const FIXTURE = join(process.cwd(), ".tmp-health-refs-test");

describe("loadHealthReferenceBlock", () => {
  beforeEach(() => {
    rmSync(FIXTURE, { recursive: true, force: true });
    mkdirSync(join(FIXTURE, "journal"), { recursive: true });
    writeFileSync(join(FIXTURE, "user-context.md"), "# User\nPush A routine id abc.");
    writeFileSync(join(FIXTURE, "recovery-routine.md"), "# Recovery\nMax 3 gym days.");
    writeFileSync(join(FIXTURE, "journal", "2026-07-16.md"), "# Rest day");
    process.env.MAGNUS_HEALTH_REFERENCES_DIR = FIXTURE;
  });

  afterEach(() => {
    delete process.env.MAGNUS_HEALTH_REFERENCES_DIR;
    rmSync(FIXTURE, { recursive: true, force: true });
  });

  it("loads committed health memory files into one block", async () => {
    const { block, sources } = await loadHealthReferenceBlock();
    expect(block).toContain("Health program memory");
    expect(block).toContain("Push A routine id abc");
    expect(block).toContain("Max 3 gym days");
    expect(block).toContain("Rest day");
    expect(sources).toContain("file:user-context.md");
    expect(sources).toContain("file:recovery-routine.md");
  });
});
