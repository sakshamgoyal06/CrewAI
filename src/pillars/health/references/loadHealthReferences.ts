import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { supabase } from "../../../tools/clients.js";
import { logger } from "../../../logger.js";
import { loggableError } from "../../../util/loggableError.js";
import { healthReferencesDir } from "./healthReferencesDir.js";

const MAX_FILE_CHARS = 6_000;
const MAX_JOURNAL_FILE_CHARS = 2_500;
const MAX_TOTAL_CHARS = 18_000;

function readTextFile(path: string, maxChars: number): string | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    const raw = readFileSync(path, "utf8").trim();
    if (!raw) {
      return null;
    }
    return raw.length > maxChars ? `${raw.slice(0, maxChars)}\n…[truncated]` : raw;
  } catch (e) {
    logger.warn({ err: loggableError(e), path }, "health references: read failed");
    return null;
  }
}

function listJournalMarkdownFiles(journalDir: string): string[] {
  if (!existsSync(journalDir)) {
    return [];
  }
  try {
    return readdirSync(journalDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .sort()
      .reverse()
      .slice(0, 3);
  } catch (e) {
    logger.warn({ err: loggableError(e), journalDir }, "health references: journal list failed");
    return [];
  }
}

async function loadSupabaseJournalExcerpts(
  userProfileId: string | undefined,
  limit: number,
): Promise<string[]> {
  if (!userProfileId) {
    return [];
  }
  const { data, error } = await supabase
    .from("magnus_daily_logs")
    .select("log_date, body, created_at")
    .eq("user_profile_id", userProfileId)
    .contains("metadata", { health_journal: true })
    .order("log_date", { ascending: false })
    .limit(limit);

  if (error) {
    logger.warn(
      { err: loggableError(error), userProfileId },
      "health references: supabase journal load failed",
    );
    return [];
  }

  return (data ?? []).map((row) => {
    const date = row.log_date ?? "?";
    const body = String(row.body ?? "").trim();
    const clipped =
      body.length > MAX_JOURNAL_FILE_CHARS
        ? `${body.slice(0, MAX_JOURNAL_FILE_CHARS)}\n…[truncated]`
        : body;
    return `### Telegram journal — ${date}\n${clipped}`;
  });
}

export type HealthReferenceLoadResult = {
  block: string;
  sources: string[];
  charCount: number;
};

/**
 * Build a single prompt block from committed health memory files + recent Telegram journals.
 */
export async function loadHealthReferenceBlock(
  userProfileId?: string,
): Promise<HealthReferenceLoadResult> {
  const root = healthReferencesDir();
  const parts: string[] = [];
  const sources: string[] = [];

  const staticFiles: { file: string; max: number }[] = [
    { file: "user-context.md", max: MAX_FILE_CHARS },
    { file: "weekly-schedule.md", max: MAX_FILE_CHARS },
    { file: "program-learnings.md", max: MAX_FILE_CHARS },
    { file: "recovery-routine.md", max: MAX_FILE_CHARS },
  ];

  for (const { file, max } of staticFiles) {
    const text = readTextFile(join(root, file), max);
    if (text) {
      parts.push(`## ${file}\n${text}`);
      sources.push(`file:${file}`);
    }
  }

  const journalDir = join(root, "journal");
  for (const file of listJournalMarkdownFiles(journalDir)) {
    const text = readTextFile(join(journalDir, file), MAX_JOURNAL_FILE_CHARS);
    if (text) {
      parts.push(`## journal/${file}\n${text}`);
      sources.push(`file:journal/${file}`);
    }
  }

  const supabaseJournals = await loadSupabaseJournalExcerpts(userProfileId, 3);
  for (const entry of supabaseJournals) {
    parts.push(entry);
    sources.push("supabase:health_journal");
  }

  if (parts.length === 0) {
    return { block: "", sources: [], charCount: 0 };
  }

  let body = parts.join("\n\n");
  if (body.length > MAX_TOTAL_CHARS) {
    body = `${body.slice(0, MAX_TOTAL_CHARS)}\n…[health memory truncated]`;
  }

  const block = `\n\n---\nHealth program memory (Magnus — use for coaching, recovery gates, Hevy context):\n${body}\n---\n`;
  return { block, sources, charCount: block.length };
}
