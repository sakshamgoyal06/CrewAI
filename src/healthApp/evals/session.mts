/**
 * Runs the coach evals inside a Claude session instead of on the API key (Saksham's cost rule:
 * evals never bill the Anthropic API). The real turn loop runs (chat.ts answerTurn: context block,
 * tool rounds, fixed draft lines, the phantom-card guard) with stubbed tools; the only thing
 * replaced is the model call. A Claude session plays the model: it reads the requests this script
 * writes, answers as the coach, and the script replays those answers through the real loop.
 *
 *   npm run evals:session -- --run 2026-11-12-baseline            # step the run, write pending + report
 *   npm run evals:session -- --run <name> --set coach|legacy|all  # which cases (default coach)
 *   npm run evals:session -- --run <name> --only hinglish          # ids or categories containing this
 *
 * Each call replays every recorded answer and stops each case at the first model round with no
 * answer yet. Files under src/healthApp/evals/runs/<name>/:
 *   system.md          the system prompt and tool list the coach answers with (written once)
 *   pending.md         the next request for every unfinished case: context block, history, message,
 *                      tool results so far
 *   responses/*.json   the session's answers: { "<case id>": { "<round>": { "text": "...",
 *                      "tools": [{ "name": "...", "input": { ... } }] } } } (any number of files)
 *   judgments/*.json   rubric grades by a judge pass: { "<case id>": { "must": [true, ...],
 *                      "mustNot": [false, ...], "note": "..." } } (mustNot true = it did the bad thing)
 *   report.md, results.json   per case: code checks, rubric, reply, tools; per category pass rates
 *
 * No network: the Anthropic base URL points nowhere, so a stray real call fails instead of billing.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

process.env.SUPABASE_URL ||= "http://127.0.0.1:9";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "eval-no-network";
process.env.ANTHROPIC_API_KEY = "eval-no-network";
process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:9";
// One model plays every round, so the fast-model escalations never ask for a round twice.
const productionEnv = { ...process.env, MAGNUS_HEALTH_CHAT_ROUTING: process.env.MAGNUS_HEALTH_CHAT_ROUTING ?? "" };
process.env.MAGNUS_HEALTH_CHAT_ROUTING = "off";
process.env.LOG_LEVEL ||= "silent";

type Round = { text?: string; tools?: Array<{ name: string; input?: Record<string, unknown> }> };
type Judgment = { must?: boolean[]; mustNot?: boolean[]; note?: string };

class Pending extends Error {}

const here = dirname(fileURLToPath(import.meta.url));

function arg(name: string): string | null {
  const a = process.argv.slice(2);
  const i = a.indexOf(`--${name}`);
  return i >= 0 ? (a[i + 1] ?? null) : null;
}

function readDir<T>(dir: string): Record<string, T> {
  const out: Record<string, T> = {};
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const data = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<string, T>;
    for (const [k, v] of Object.entries(data)) out[k] = typeof v === "object" && v && !Array.isArray(v) && typeof out[k] === "object" ? { ...out[k], ...v } : v;
  }
  return out;
}

function blockText(c: unknown): string {
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) return JSON.stringify(c);
  return c
    .map((b: Record<string, unknown>) => {
      if (b.type === "text") return String(b.text);
      if (b.type === "tool_use") return `[tool_use ${String(b.name)} ${JSON.stringify(b.input)}]`;
      if (b.type === "tool_result") return `[tool_result${b.is_error ? " ERROR" : ""} ${typeof b.content === "string" ? b.content : JSON.stringify(b.content)}]`;
      return JSON.stringify(b);
    })
    .join("\n");
}

async function main(): Promise<void> {
  const run = arg("run");
  if (!run) {
    console.error("Pass --run <name>.");
    process.exit(2);
  }
  const set = arg("set") ?? "coach";
  const only = arg("only");
  const dir = join(here, "runs", run);
  mkdirSync(join(dir, "responses"), { recursive: true });
  mkdirSync(join(dir, "judgments"), { recursive: true });

  const [{ evalTurn, pickChatModel }, { CASES }, { COACH_CASES, caseInputs }, { score }, { stubTools }] = await Promise.all([
    import("../chat.js"),
    import("./cases.js"),
    import("./coachSet.js"),
    import("./score.js"),
    import("./stubTools.js"),
  ]);
  type AnyCase = (typeof COACH_CASES)[number];
  const legacy: AnyCase[] = CASES.map((c) => ({ ...c, title: c.id, rubric: { must: [], mustNot: [] } }) as unknown as AnyCase);
  const pool: AnyCase[] = set === "legacy" ? legacy : set === "all" ? [...COACH_CASES, ...legacy] : COACH_CASES;
  const cases = pool.filter((c) => !only || c.id.includes(only) || c.category === only);

  const responses = readDir<Record<string, Round>>(join(dir, "responses"));
  const judgments = readDir<Judgment>(join(dir, "judgments"));

  let systemDump: string | null = null;
  const pending: string[] = [];
  const rows: Array<Record<string, unknown>> = [];

  for (const c of cases) {
    const input = caseInputs(c);
    const { tool, calls } = stubTools(input.snapshot, { failing: new Set(c.failing ?? []), overrides: input.toolResults });
    const rounds = responses[c.id] ?? {};
    let n = 0;
    let request: { messages: unknown[] } | null = null;
    const create = async (params: Record<string, unknown>) => {
      const round = n++;
      if (!systemDump) {
        const system = (params.system as Array<{ text: string }>)[0]!.text;
        const tools = (params.tools as Array<{ name: string; description: string; input_schema: unknown }>).map(
          (t) => `## ${t.name}\n${t.description}\ninput: ${JSON.stringify(t.input_schema)}`,
        );
        systemDump = `# System prompt\n\n${system}\n\n# Tools\n\n${tools.join("\n\n")}\n`;
      }
      const r = rounds[String(round)];
      if (!r) {
        request = { messages: params.messages as unknown[] };
        throw new Pending(`round ${round}`);
      }
      const content: Array<Record<string, unknown>> = [];
      if (r.text) content.push({ type: "text", text: r.text });
      (r.tools ?? []).forEach((t, i) => content.push({ type: "tool_use", id: `${c.id}-${round}-${i}`, name: t.name, input: t.input ?? {} }));
      return {
        id: `msg-${c.id}-${round}`,
        type: "message",
        role: "assistant",
        model: String(params.model),
        content,
        stop_reason: r.tools?.length ? "tool_use" : "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      } as never;
    };

    const routedModel = pickChatModel(c.message, productionEnv as NodeJS.ProcessEnv);
    try {
      const { reply } = await evalTurn({
        userText: c.message,
        history: c.history,
        snapshot: input.snapshot,
        details: input.details,
        memory: input.memory,
        loops: input.loops,
        tool,
        now: input.now,
        timezone: input.timezone,
        create,
      });
      const codeReasons = score(c, reply.text, calls);
      const j = judgments[c.id];
      const rubric = c.rubric ?? { must: [], mustNot: [] };
      const rubricItems = rubric.must.length + rubric.mustNot.length;
      const judged = !!j || rubricItems === 0;
      const failedMust = rubric.must.filter((_, i) => j && j.must?.[i] === false);
      const brokeMustNot = rubric.mustNot.filter((_, i) => j && j.mustNot?.[i] === true);
      const rubricMet = j ? rubricItems - failedMust.length - brokeMustNot.length : null;
      rows.push({
        id: c.id,
        category: c.category,
        title: c.title,
        message: c.message,
        routedModel,
        reply: reply.text,
        cards: reply.cards.map((x) => x.type),
        tools: calls.map((x) => ({ name: x.name, input: x.input })),
        codeReasons,
        judged,
        rubricItems,
        rubricMet,
        failedMust,
        brokeMustNot,
        note: j?.note ?? null,
        pass: codeReasons.length === 0 && judged && failedMust.length === 0 && brokeMustNot.length === 0,
      });
    } catch (err) {
      if (!(err instanceof Pending) || !request) {
        rows.push({ id: c.id, category: c.category, title: c.title, message: c.message, error: err instanceof Error ? err.message : String(err), pass: false });
        continue;
      }
      const msgs = (request as { messages: Array<{ role: string; content: unknown }> }).messages;
      const body = msgs.map((m) => `**${m.role}:**\n${blockText(m.content)}`).join("\n\n");
      pending.push(`## ${c.id} — round ${n - 1}\n${c.title}\n\n${body}\n`);
      rows.push({ id: c.id, category: c.category, title: c.title, message: c.message, pending: n - 1, pass: false });
    }
  }

  if (systemDump && !existsSync(join(dir, "system.md"))) writeFileSync(join(dir, "system.md"), systemDump);
  writeFileSync(join(dir, "pending.md"), pending.length ? `# Pending model rounds (${pending.length})\n\nAnswer each as Magnus, using system.md. Write answers to responses/*.json.\n\n${pending.join("\n---\n\n")}` : "# Nothing pending\n");
  writeFileSync(join(dir, "results.json"), `${JSON.stringify(rows, null, 2)}\n`);
  writeFileSync(join(dir, "report.md"), report(run, rows, judgments, cases));

  const done = rows.filter((r) => r.pending === undefined && !r.error);
  const unjudged = done.filter((r) => !r.judged).length;
  console.log(`${cases.length} cases: ${done.length} answered, ${pending.length} pending, ${unjudged} awaiting judgment, ${rows.filter((r) => r.pass).length} pass.`);
  console.log(`Wrote ${join("src/healthApp/evals/runs", run)}/{pending.md,report.md,results.json}`);
}

function report(run: string, rows: Array<Record<string, unknown>>, judgments: Record<string, Judgment>, cases: Array<{ id: string; category: string; rubric?: { must: string[]; mustNot: string[] } }>): string {
  const cats = [...new Set(rows.map((r) => String(r.category)))];
  const lines = [`# Coach eval run: ${run}`, "", "| Category | Pass | Cases | Rubric items met |", "|---|---|---|---|"];
  let tp = 0;
  let tn = 0;
  let rm = 0;
  let ri = 0;
  for (const cat of cats) {
    const rs = rows.filter((r) => r.category === cat);
    const p = rs.filter((r) => r.pass).length;
    const met = rs.reduce((s, r) => s + (Number(r.rubricMet) || 0), 0);
    const items = rs.filter((r) => r.rubricMet != null).reduce((s, r) => s + (Number(r.rubricItems) || 0), 0);
    tp += p;
    tn += rs.length;
    rm += met;
    ri += items;
    lines.push(`| ${cat} | ${p} | ${rs.length} | ${items ? `${met}/${items}` : "–"} |`);
  }
  lines.push(`| **all** | **${tp}** | **${tn}** (${tn ? Math.round((tp / tn) * 100) : 0}%) | ${ri ? `${rm}/${ri} (${Math.round((rm / ri) * 100)}%)` : "–"} |`, "");
  const fails = rows.filter((r) => !r.pass && r.pending === undefined);
  lines.push(`## Failures (${fails.length})`, "");
  for (const r of fails) {
    const c = cases.find((x) => x.id === r.id);
    lines.push(`### ${String(r.id)} [${String(r.category)}]`, `${String(r.title)}`, "", `> ${String(r.message).replace(/\n/g, " ")}`, "");
    if (r.error) lines.push(`- error: ${String(r.error)}`);
    for (const x of (r.codeReasons as string[] | undefined) ?? []) lines.push(`- code check: ${x}`);
    for (const x of (r.failedMust as string[] | undefined) ?? []) lines.push(`- missed must: ${x}`);
    for (const x of (r.brokeMustNot as string[] | undefined) ?? []) lines.push(`- did must-not: ${x}`);
    if (!r.judged && c?.rubric && (c.rubric.must.length || c.rubric.mustNot.length)) lines.push("- not judged yet");
    const tools = (r.tools as Array<{ name: string; input: unknown }> | undefined) ?? [];
    lines.push(`- tools: ${tools.map((t) => `${t.name} ${JSON.stringify(t.input)}`).join("; ") || "none"}`);
    lines.push(`- reply: ${String(r.reply ?? "").replace(/\n/g, " ")}`);
    if (judgments[String(r.id)]?.note) lines.push(`- judge: ${judgments[String(r.id)]!.note}`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

void main();
