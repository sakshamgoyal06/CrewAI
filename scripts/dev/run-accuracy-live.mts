#!/usr/bin/env npx tsx
/**
 * Live LLM accuracy eval (Step 8 in MAGNUS_ACCURACY_PLAN.md).
 * Requires ANTHROPIC_API_KEY and Supabase test fixtures — not run in CI by default.
 *
 * Usage:
 *   MAGNUS_ACCURACY_LIVE=1 npx tsx scripts/dev/run-accuracy-live.mts
 */
console.log(`
Magnus live accuracy eval is not wired yet.

Step 8 plan:
  1. Select 50 minimal-mode scenarios from magnusAccuracyScenarios.ts
  2. Run runOrchestratorReply with real Anthropic (no fixture mock)
  3. Record routing@1, tool_select@1, action_integrity
  4. Append dated section to docs/review/MAGNUS_ACCURACY_SCORECARD.md

For CI fixture metrics, run: npm run test:accuracy
`);

if (!process.env.MAGNUS_ACCURACY_LIVE) {
  console.log("Set MAGNUS_ACCURACY_LIVE=1 to acknowledge live eval (stub exits 0).");
  process.exit(0);
}

process.exit(0);
