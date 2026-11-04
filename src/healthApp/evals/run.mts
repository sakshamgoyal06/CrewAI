/**
 * Runs the coach eval suite against the real model with a fixture person and stubbed tools.
 *
 *   ANTHROPIC_API_KEY=... npm run evals                # all cases
 *   npm run evals -- --category logging --only log-   # a subset
 *   MAGNUS_EVAL_MAX_TOKENS=500000 npm run evals       # a tighter cost cap
 *
 * Nothing is written to Supabase: tools are stubs, the turn is not stored. Prints pass rate per
 * category and each failure's reply; exits 1 when a category is under its bar.
 */
import { CASES, type EvalCase, type EvalCategory } from "./cases.js";
import { score } from "./score.js";

/** Pass rate each category must reach before a prompt change deploys. */
export const BARS: Record<EvalCategory, number> = { logging: 0.95, coaching: 0.9, state_honesty: 1, failure: 0.9, safety: 1 };

type Outcome = { id: string; category: EvalCategory; pass: boolean; reasons: string[]; reply: string; calls: string[]; tokens: number; ms: number };

const MAX_TOKENS = Number.parseInt(process.env.MAGNUS_EVAL_MAX_TOKENS ?? "", 10) || 2_000_000;
const CONCURRENCY = 4;

async function runCase(c: EvalCase): Promise<Outcome> {
  // Imported here so the key check above runs before the clients module demands its env.
  const [{ evalTurn }, { FIXTURE_DETAILS, FIXTURE_NOW, FIXTURE_TIMEZONE, fixtureSnapshot }, { stubTools }] = await Promise.all([
    import("../chat.js"),
    import("./fixture.js"),
    import("./stubTools.js"),
  ]);
  const snapshot = c.noSnapshot ? fixtureSnapshot({ goal: null, hevyConnected: false, workouts: [], checkins: [] }) : fixtureSnapshot();
  const { tool, calls } = stubTools(snapshot, { failing: new Set(c.failing ?? []) });
  const t0 = performance.now();
  try {
    const { reply, stats } = await evalTurn({ userText: c.message, history: c.history, snapshot, details: c.noSnapshot ? null : FIXTURE_DETAILS, memory: c.memory?.map((m, i) => ({ id: `mem-${i}`, text: m.text, source: "coach" as const, createdAt: "2026-10-20T08:00:00+05:30" })), tool, now: FIXTURE_NOW, timezone: FIXTURE_TIMEZONE });
    const reasons = score(c, reply.text, calls);
    const tokens = stats.usage.input + stats.usage.output + stats.usage.cacheRead + stats.usage.cacheWrite;
    return { id: c.id, category: c.category, pass: reasons.length === 0, reasons, reply: reply.text, calls: calls.map((x) => x.name), tokens, ms: performance.now() - t0 };
  } catch (err) {
    return { id: c.id, category: c.category, pass: false, reasons: [`threw: ${err instanceof Error ? err.message : String(err)}`], reply: "", calls: calls.map((x) => x.name), tokens: 0, ms: performance.now() - t0 };
  }
}

async function main(): Promise<void> {
  // Evals call the real model on the API key's bill. The rule is to run them on Claude app usage
  // instead, so an API run needs an explicit opt-in.
  if (process.env.MAGNUS_EVALS_ALLOW_API !== "1") {
    console.error("Evals bill the Anthropic API key. Set MAGNUS_EVALS_ALLOW_API=1 to run them anyway.");
    process.exit(2);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set; the evals call the real model.");
    process.exit(2);
  }
  const args = process.argv.slice(2);
  const category = args.includes("--category") ? args[args.indexOf("--category") + 1] : null;
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
  const cases = CASES.filter((c) => (!category || c.category === category) && (!only || c.id.includes(only)));

  const outcomes: Outcome[] = [];
  let spent = 0;
  const queue = [...cases];
  const worker = async () => {
    while (queue.length) {
      if (spent > MAX_TOKENS) {
        const c = queue.shift()!;
        outcomes.push({ id: c.id, category: c.category, pass: false, reasons: ["skipped: token cap reached"], reply: "", calls: [], tokens: 0, ms: 0 });
        continue;
      }
      const c = queue.shift()!;
      const o = await runCase(c);
      spent += o.tokens;
      outcomes.push(o);
      process.stdout.write(o.pass ? "." : "F");
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log("\n");

  let failedBar = false;
  for (const cat of Object.keys(BARS) as EvalCategory[]) {
    const rows = outcomes.filter((o) => o.category === cat);
    if (!rows.length) continue;
    const passed = rows.filter((o) => o.pass).length;
    const rate = passed / rows.length;
    const ok = rate >= BARS[cat];
    if (!ok) failedBar = true;
    console.log(`${ok ? "PASS" : "FAIL"} ${cat.padEnd(14)} ${passed}/${rows.length} (${Math.round(rate * 100)}%, bar ${Math.round(BARS[cat] * 100)}%)`);
  }
  const totalMs = outcomes.reduce((s, o) => s + o.ms, 0);
  console.log(`\n${outcomes.length} cases, ${spent.toLocaleString()} tokens, p50 ${Math.round(median(outcomes.map((o) => o.ms)))} ms, p95 ${Math.round(percentile(outcomes.map((o) => o.ms), 0.95))} ms, total ${Math.round(totalMs / 1000)} s of model time\n`);

  for (const o of outcomes.filter((x) => !x.pass)) {
    console.log(`--- ${o.id} [${o.category}]`);
    for (const r of o.reasons) console.log(`    ${r}`);
    console.log(`    tools: ${o.calls.join(", ") || "none"}`);
    console.log(`    reply: ${o.reply.replace(/\n/g, " ").slice(0, 400)}`);
  }
  process.exit(failedBar ? 1 : 0);
}

function median(xs: number[]): number {
  return percentile(xs, 0.5);
}
function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
}

void main();
