import { beforeEach, describe, expect, it, vi } from "vitest";

import { gatherResearchMaterials } from "./gather.js";

describe("gatherResearchMaterials", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns non-empty sources with citations material when fetch returns HTML", async () => {
    const html = `<!doctype html><html><head><title>Example Study</title></head><body><p>Quantum widgets improve efficiency.</p></body></html>`;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const result = await gatherResearchMaterials(
      "Please summarise https://example.com/page about widgets",
      { fetchImpl: fetchMock as unknown as typeof fetch },
    );

    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources[0]?.url).toContain("example.com");
    expect(result.sources[0]?.title).toContain("Example Study");
    expect(result.sources[0]?.excerpt).toMatch(/Quantum widgets/i);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("extracts pasted excerpt when no URLs", async () => {
    const pasted = "x".repeat(450);
    const result = await gatherResearchMaterials(`Intro\n\n${pasted}`, {
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    expect(result.pastedExcerpt).toContain("xxx");
    expect(result.sources.length).toBe(0);
  });
});
