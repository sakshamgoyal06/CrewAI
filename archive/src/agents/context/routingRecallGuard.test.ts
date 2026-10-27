import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("recall_context routing guard (Step 4)", () => {
  it("never loads recall in assembleRoutingContext (Layer 1)", () => {
    const src = readFileSync(join(here, "assembleRoutingContext.ts"), "utf8");
    expect(src).not.toContain("recall_context");
    expect(src).not.toContain("recallContext");
    expect(src).not.toContain("memoryEmbeddings");
    expect(src).not.toContain("searchMemoryEmbeddings");
  });

  it("never loads recall in routingContextParser module", () => {
    const src = readFileSync(join(here, "../routing/routingContextParser.ts"), "utf8");
    expect(src).not.toContain("recall_context");
    expect(src).not.toContain("memoryEmbeddings");
  });
});
