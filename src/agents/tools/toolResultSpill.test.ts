import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  appendInternalLoopTools,
  estimateToolResultItemCount,
  estimateTokens,
  formatSpillHandle,
  maybeSpillToolResult,
  readToolArtifact,
  resetToolResultSpillConfigForTests,
  toolResultSpillConfig,
} from "./toolResultSpill.js";

function mockRedis() {
  const store = new Map<string, string>();
  return {
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return "OK";
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    store,
  };
}

function calendarEventLine(i: number): string {
  return `- Mon ${i} Sep 09:00–10:00 — Meeting ${i} — ${"agenda item ".repeat(6)}@ Room ${i} [id: evt-${i}]`;
}

describe("toolResultSpill", () => {
  beforeEach(() => {
    resetToolResultSpillConfigForTests();
    process.env.MAGNUS_TOOL_RESULT_SPILL_CHARS = "4000";
    process.env.MAGNUS_TOOL_RESULT_SPILL_PREVIEW_CHARS = "800";
    resetToolResultSpillConfigForTests();
  });

  afterEach(() => {
    delete process.env.MAGNUS_TOOL_RESULT_SPILL_CHARS;
    delete process.env.MAGNUS_TOOL_RESULT_SPILL_PREVIEW_CHARS;
    resetToolResultSpillConfigForTests();
  });

  it("does not spill under threshold", async () => {
    const redis = mockRedis();
    const out = await maybeSpillToolResult({
      userProfileId: "u1",
      toolName: "read_calendar",
      rawOutput: "short output",
      deps: { redis },
    });
    expect(out).toBe("short output");
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("spills large calendar output with count and preview", async () => {
    const redis = mockRedis();
    const body = Array.from({ length: 50 }, (_, i) => calendarEventLine(i + 1)).join("\n");
    expect(body.length).toBeGreaterThan(4000);

    const spilled = await maybeSpillToolResult({
      userProfileId: "u1",
      toolName: "read_calendar",
      rawOutput: body,
      deps: { redis },
    });

    const parsed = JSON.parse(spilled) as {
      spilled: boolean;
      artifact_id: string;
      count: number;
      preview: string;
      total_chars: number;
    };
    expect(parsed.spilled).toBe(true);
    expect(parsed.count).toBe(50);
    expect(parsed.total_chars).toBe(body.length);
    expect(parsed.preview.length).toBeLessThanOrEqual(801);
    expect(estimateTokens(spilled)).toBeLessThan(500);
  });

  it("round-trips full artifact body without data loss", async () => {
    const redis = mockRedis();
    const body = Array.from({ length: 50 }, (_, i) => calendarEventLine(i + 1)).join("\n");
    const spilled = await maybeSpillToolResult({
      userProfileId: "u1",
      toolName: "read_calendar",
      rawOutput: body,
      deps: { redis },
    });
    const { artifact_id: artifactId } = JSON.parse(spilled) as { artifact_id: string };

    const full = await readToolArtifact({
      userProfileId: "u1",
      artifactId,
      offsetChars: 0,
      maxChars: body.length + 200,
      deps: { redis },
    });
    expect(full).toContain("evt-1");
    expect(full).toContain("evt-50");
    expect(full).toContain(body);
  });

  it("50-event spill keeps loop payload under 8K token budget", async () => {
    const redis = mockRedis();
    const body = Array.from({ length: 50 }, (_, i) => calendarEventLine(i + 1)).join("\n");
    const spilled = await maybeSpillToolResult({
      userProfileId: "u1",
      toolName: "read_calendar",
      rawOutput: body,
      deps: { redis },
    });
    expect(body.length).toBeGreaterThan(4000);
    expect(estimateTokens(spilled)).toBeLessThan(8000);
    expect(estimateTokens(spilled)).toBeLessThan(estimateTokens(body));
  });

  it("counts calendar events from id markers", () => {
    const body = [1, 2, 3].map((i) => calendarEventLine(i)).join("\n");
    expect(estimateToolResultItemCount(body, "read_calendar")).toBe(3);
  });

  it("appendInternalLoopTools adds read_tool_artifact once", () => {
    const base = [{ name: "read_calendar", description: "x", input_schema: { type: "object" } }];
    const withInternal = appendInternalLoopTools(base);
    expect(withInternal).toHaveLength(2);
    expect(withInternal[1]?.name).toBe("read_tool_artifact");
    expect(appendInternalLoopTools(withInternal)).toHaveLength(2);
  });

  it("formatSpillHandle includes tool name", () => {
    const json = formatSpillHandle({
      artifactId: "abc",
      toolName: "list_items",
      rawOutput: "x".repeat(5000),
      previewChars: 100,
    });
    expect(JSON.parse(json).tool).toBe("list_items");
  });
});
