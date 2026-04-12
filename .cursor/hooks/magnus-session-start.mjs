/**
 * Cursor sessionStart hook: inject magnus.md into additional_context.
 * stdin: { session_id, is_background_agent, composer_mode? }
 * stdout: { additional_context?: string, env?: object }
 */
import fs from "fs";
import path from "path";

function consumeStdinIfPiped() {
  if (process.stdin.isTTY) {
    return;
  }
  try {
    fs.readFileSync(0, "utf8");
  } catch {
    /* ignore */
  }
}

const projectRoot = process.env.CURSOR_PROJECT_DIR || process.cwd();
const magnusPath = path.join(projectRoot, "magnus.md");

let body = "";
try {
  body = fs.readFileSync(magnusPath, "utf8");
} catch {
  body = "(File not found: magnus.md at project root. Create it or fix CURSOR_PROJECT_DIR.)";
}

const maxChars = 9000;
const truncated =
  body.length > maxChars
    ? `${body.slice(0, maxChars)}\n\n[Truncated. Open magnus.md for the full project tracker.]`
    : body;

// Consume stdin JSON when Cursor pipes input (avoid blocking on manual `node` runs)
consumeStdinIfPiped();

const additional_context = [
  "## Magnus project tracker (injected at session start)",
  "",
  truncated,
  "",
  "---",
  "**Agent instruction:** After substantive edits, update magnus.md and bump Last updated.",
].join("\n");

process.stdout.write(
  JSON.stringify({
    additional_context,
  }),
);
