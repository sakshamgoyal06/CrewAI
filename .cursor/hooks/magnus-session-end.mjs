/**
 * Cursor sessionEnd hook: append a reminder line (fire-and-forget; output not acted on by Cursor).
 * stdin: { session_id, reason, duration_ms, ... }
 */
import fs from "fs";
import path from "path";

let input = {};
if (!process.stdin.isTTY) {
  try {
    input = JSON.parse(fs.readFileSync(0, "utf8"));
  } catch {
    /* ignore */
  }
}

const projectRoot = process.env.CURSOR_PROJECT_DIR || process.cwd();
const logDir = path.join(projectRoot, ".cursor");
const logPath = path.join(logDir, "magnus-maintenance-log.txt");

const line = `${new Date().toISOString()} sessionEnd reason=${String(input.reason ?? "unknown")} — if you changed behavior, update magnus.md\n`;

try {
  fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(logPath, line, "utf8");
} catch (err) {
  process.stderr.write(String(err) + "\n");
}

// Valid empty JSON for hooks that expect stdout
process.stdout.write("{}");
