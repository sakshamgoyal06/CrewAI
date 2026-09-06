#!/usr/bin/env npx tsx
/**
 * Run accuracy suite and write scorecard markdown.
 * Usage: npm run test:accuracy
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const scorecardPath = join(root, "docs/review/MAGNUS_ACCURACY_SCORECARD.md");

console.log("Running Magnus accuracy suite…\n");

try {
  execSync("npm test -- src/capabilities/magnusAccuracySuite.test.ts --reporter=verbose", {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "test" },
  });
} catch {
  process.exitCode = 1;
}

// Scorecard body is logged by the test; write stub pointer if missing
const stub = `# Magnus accuracy scorecard

**Generated:** ${new Date().toISOString()}

See CI log output from \`magnusAccuracySuite.test.ts\` "accuracy gates" test for the full metrics table.

Regenerate: \`npm run test:accuracy\`

Plan: \`docs/review/MAGNUS_ACCURACY_PLAN.md\`
`;

writeFileSync(scorecardPath, stub);
console.log(`\nScorecard stub updated: ${scorecardPath}`);

if (process.exitCode) {
  process.exit(process.exitCode);
}
