/**
 * Resolve every relative import in the repo to an absolute file and report which source files
 * nothing imports. Run: npx tsx scripts/dev/import-graph.mts [--include-tests]
 *
 * Development aid for dead-code audits; not part of the running bot.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const ROOTS = ["src", "scripts", "mcp"];
const countTests = process.argv.includes("--include-tests");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "dist") {
        continue;
      }
      walk(full, out);
    } else if (/\.(ts|mts|mjs)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const files = ROOTS.flatMap((r) => walk(join(ROOT, r)));
const isTest = (f: string): boolean => f.endsWith(".test.ts");

/** `./x.js` in TypeScript NodeNext resolves to `./x.ts` on disk. */
function resolveSpecifier(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) {
    return null;
  }
  const base = resolve(dirname(fromFile), spec);
  const candidates = [
    base.replace(/\.js$/, ".ts"),
    base.replace(/\.js$/, ".mts"),
    base,
    join(base, "index.ts"),
  ];
  return candidates.find((c) => {
    try {
      return statSync(c).isFile();
    } catch {
      return false;
    }
  }) ?? null;
}

const importedBy = new Map<string, string[]>();
for (const file of files) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
    const target = resolveSpecifier(file, m[1]);
    if (target) {
      importedBy.set(target, [...(importedBy.get(target) ?? []), file]);
    }
  }
}

const rel = (f: string): string => relative(ROOT, f);
const entrypoints = new Set(
  ["src/index.ts", "mcp/google-calendar/server.mts"].map((p) => join(ROOT, p)),
);

/** Files imported only by `*.test.ts` — helpers, not dead production code. */
const testOnlyImported = files
  .filter((f) => !isTest(f))
  .filter((f) => !entrypoints.has(f))
  .filter((f) => !f.includes("/scripts/"))
  .filter((f) => {
    const importers = importedBy.get(f) ?? [];
    return importers.length > 0 && importers.every(isTest);
  });

const orphans = files
  .filter((f) => !isTest(f))
  .filter((f) => !entrypoints.has(f))
  .filter((f) => !f.includes("/scripts/"))
  .filter((f) => (importedBy.get(f)?.length ?? 0) === 0);

console.log(
  `Scanned ${files.length} files (test imports counted for reachability).\n`,
);
console.log(`Production orphans (${orphans.length}):`);
for (const f of orphans.sort()) {
  console.log(`  ${rel(f)}`);
}

if (testOnlyImported.length > 0) {
  console.log(`\nImported only by tests (${testOnlyImported.length}):`);
  for (const f of testOnlyImported.sort()) {
    console.log(`  ${rel(f)}`);
  }
}

const testOnly = testOnlyImported;

if (!countTests) {
  console.log(
    "\n(Re-run with --include-tests to build the import graph using test files as importers too.)",
  );
} else if (testOnly.length === 0) {
  console.log("\nNo test-only imports beyond the lists above.");
}
