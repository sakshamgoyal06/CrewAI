/**
 * Analyze 1000-message chat test suite + production conversation pairs.
 * Usage: npx tsx scripts/dev/analyze-chat-test-suite.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "dummy";
process.env.UPSTASH_REDIS_REST_URL ??= "https://example.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN ??= "dummy";
process.env.ANTHROPIC_API_KEY ??= "dummy";
process.env.TELEGRAM_BOT_TOKEN ??= "dummy";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");

const { buildIntentRoutingHints } = await import(
  "../../src/agents/routing/intentRoutingHints.ts"
);
const { looksLikeMagnusToolAction } = await import(
  "../../src/agents/tools/magnusActionDetect.ts"
);
const { looksLikeYoutubeAction } = await import(
  "../../src/agents/tools/youtubeActionDetect.ts"
);
const { parseMealLogCommand } = await import("../../src/meals/parseMealLogCommand.ts");
const { resolvePillarsToConsultOnGeneral } = await import(
  "../../src/agents/routing/pillarConsultationSignals.ts"
);
const { CHAT_MESSAGE_TEST_SUITE, CHAT_MESSAGE_TEST_SUITE_META } = await import(
  "../../src/capabilities/chatMessageTestSuite.generated.ts"
);
const {
  analyzeStructuralCase,
  PRODUCTION_ISSUE_FINDINGS,
  summarizeSuiteAnalysis,
} = await import("../../src/capabilities/chatMessageTestAnalysis.ts");

const deps = {
  buildHints: (msg: string) => buildIntentRoutingHints(msg) as Record<string, boolean>,
  magnusDetect: looksLikeMagnusToolAction,
  youtubeDetect: looksLikeYoutubeAction,
  mealParse: parseMealLogCommand,
  pillarConsult: (msg: string) =>
    resolvePillarsToConsultOnGeneral({ userMessage: msg, recentTurns: [] }),
};

type Pair = { user_msg: string; assistant_msg: string; intent: string | null; created_at: string };

function analyzeProductionPairs(pairs: Pair[]) {
  const issues: Array<{ user: string; intent: string | null; signal: string }> = [];

  for (const p of pairs) {
    const u = p.user_msg.toLowerCase();
    const a = p.assistant_msg.toLowerCase();

    if (/\bi am (having|eating)\b/.test(u) && a.includes("couldn't log")) {
      issues.push({ user: p.user_msg.slice(0, 80), intent: p.intent, signal: "present_tense_rejected" });
    }
    if (/\bundo\b/.test(u) && a.includes("need a bit more clarity")) {
      issues.push({ user: p.user_msg.slice(0, 80), intent: p.intent, signal: "undo_disambiguation" });
    }
    if (/\btwice\b/.test(u) && /\bremoved|corrected\b/.test(a)) {
      issues.push({ user: p.user_msg.slice(0, 80), intent: p.intent, signal: "duplicate_correction" });
    }
    if (/\bwhen did i add\b/.test(u) && a.includes("doesn't store")) {
      issues.push({ user: p.user_msg.slice(0, 80), intent: p.intent, signal: "timestamp_gap" });
    }
    if (a.includes("one or more save steps failed")) {
      issues.push({ user: p.user_msg.slice(0, 80), intent: p.intent, signal: "partial_tool_failure" });
    }
    if (/\bmeal logged\b.*\bmeal logged\b/i.test(p.assistant_msg)) {
      issues.push({ user: p.user_msg.slice(0, 80), intent: p.intent, signal: "duplicate_compose" });
    }
    if (/\bnot looking at calendar\b/.test(u) || /\bcheck using calendar\b/.test(u)) {
      issues.push({ user: p.user_msg.slice(0, 80), intent: p.intent, signal: "calendar_trust" });
    }
    if (p.intent === "HAPPINESS" && /\bplaylist\b/.test(u)) {
      issues.push({ user: p.user_msg.slice(0, 80), intent: p.intent, signal: "playlist_wrong_pillar" });
    }
  }

  const bySignal: Record<string, number> = {};
  for (const i of issues) {
    bySignal[i.signal] = (bySignal[i.signal] ?? 0) + 1;
  }
  return { issues, bySignal, uniqueSignals: Object.keys(bySignal).length };
}

function main() {
  const results = CHAT_MESSAGE_TEST_SUITE.map((tc) => analyzeStructuralCase(tc, deps));
  const summary = summarizeSuiteAnalysis(CHAT_MESSAGE_TEST_SUITE, results);
  const failures = results.filter((r) => !r.passed);

  let pairAnalysis = { issues: [] as ReturnType<typeof analyzeProductionPairs>["issues"], bySignal: {}, uniqueSignals: 0 };
  try {
    const pairs = JSON.parse(
      readFileSync(join(root, "data/chat-samples/conversation-pairs.json"), "utf8"),
    ) as Pair[];
    pairAnalysis = analyzeProductionPairs(pairs);
  } catch {
    console.warn("No conversation-pairs.json — skipping production pair analysis");
  }

  const md = `# Chat message test suite — analysis

**Date:** ${new Date().toISOString().slice(0, 10)}  
**Suite:** \`src/capabilities/chatMessageTestSuite.generated.ts\`  
**Command:** \`npx tsx scripts/dev/analyze-chat-test-suite.mts\`

---

## Suite composition

| Metric | Value |
|--------|-------|
| Total test messages | **${summary.total}** |
| From real production chats | **${CHAT_MESSAGE_TEST_SUITE_META.realChatCount}** |
| From userQueryCatalog | **${CHAT_MESSAGE_TEST_SUITE_META.bySource.catalog ?? 0}** |
| Synthetic + variations | **${(CHAT_MESSAGE_TEST_SUITE_META.bySource.synthetic ?? 0) + (CHAT_MESSAGE_TEST_SUITE_META.bySource.variation ?? 0)}** |
| Adversarial edge cases | **${CHAT_MESSAGE_TEST_SUITE_META.bySource.adversarial ?? 0}** |
| Messages with issue tags | **${summary.withIssueTags}** |
| Catalog-aligned (ideal intent) | **${summary.catalogAligned}** |

### By source

${Object.entries(CHAT_MESSAGE_TEST_SUITE_META.bySource)
  .map(([k, v]) => `- **${k}:** ${v}`)
  .join("\n")}

### Issue tags (from real chat inference)

${Object.entries(summary.byIssueTag)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `- **${k}:** ${v}`)
  .join("\n") || "_none_"}

---

## Structural routing results

| Check | Result |
|-------|--------|
| Structural pass | **${summary.structuralPass}** / ${summary.total} |
| Structural fail | **${summary.structuralFail}** |
| Youtube ∩ Magnus collisions | **${summary.detectorCollisions}** |
| Follow-ups missing prior-turn flag | **${summary.followUpWithoutPriorTurnFlag}** |

${failures.length ? `### Structural failures (first 20)\n\n${failures
  .slice(0, 20)
  .map((f) => `- \`${f.id}\` ${f.message}: ${f.failures.join("; ")}`)
  .join("\n")}` : "**No structural failures.**"}

---

## Production conversation analysis (${pairAnalysis.issues.length} signals)

${Object.entries(pairAnalysis.bySignal)
  .sort((a, b) => (b[1] as number) - (a[1] as number))
  .map(([k, v]) => `- **${k}:** ${v}`)
  .join("\n") || "_no pairs file_"}

---

## Documented improvement areas

${PRODUCTION_ISSUE_FINDINGS.map(
  (f) => `### ${f.id} — ${f.title} (${f.severity})

**Examples:** ${f.examples.map((e) => `"${e}"`).join(" · ")}

**Root cause:** ${f.rootCause}

**Improvement:** ${f.improvement}
`,
).join("\n")}

---

## Regenerate

\`\`\`bash
npx tsx scripts/dev/generate-chat-message-test-suite.mts
npm test -- src/capabilities/chatMessageTestSuite.test.ts
npx tsx scripts/dev/analyze-chat-test-suite.mts
\`\`\`
`;

  const outPath = join(root, "docs/review/CHAT_MESSAGE_TEST_SUITE_ANALYSIS.md");
  writeFileSync(outPath, md);
  console.log(`Wrote ${outPath}`);
  console.log("Summary:", JSON.stringify(summary, null, 2));
  console.log("Production signals:", pairAnalysis.bySignal);
}

main();
