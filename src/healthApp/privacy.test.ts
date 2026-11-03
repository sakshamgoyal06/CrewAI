import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {}, anthropic: {} }));

const { EXPORT_TABLES, NOT_EXPORTED } = await import("./privacy.js");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return p.endsWith(".ts") && !p.endsWith(".test.ts") ? [p] : [];
  });
}

describe("account export", () => {
  it("covers every table the server reads or writes, or says why not", () => {
    const used = new Set<string>();
    for (const f of sourceFiles("src")) {
      for (const m of readFileSync(f, "utf8").matchAll(/\.from\("(\w+)"\)/g)) used.add(m[1]!);
    }
    const covered = new Set<string>([...EXPORT_TABLES, ...Object.keys(NOT_EXPORTED)]);
    expect([...used].filter((t) => !covered.has(t)).sort()).toEqual([]);
  });

  it("never exports credentials", () => {
    for (const t of ["health_app_tokens", "user_integrations", "health_push_subscriptions"]) {
      expect(EXPORT_TABLES as readonly string[]).not.toContain(t);
    }
  });
});
