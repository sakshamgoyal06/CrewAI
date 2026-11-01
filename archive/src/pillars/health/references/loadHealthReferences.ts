import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { supabase } from "../../../tools/clients.js";
import { logger } from "../../../logger.js";
import { loggableError } from "../../../util/loggableError.js";
import {
  loadUserProgramMemory,
  SECTION_HEADINGS,
  type ProgramMemorySection,
} from "../../../users/userProgramMemory.js";

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
 * Per-user health program memory from `user_program_memory`, plus recent Telegram journals.
 * Shared disk files are no longer loaded — use `scripts/provision-user.mts` to seed a user.
 */
export async function loadHealthReferenceBlock(
  userProfileId?: string,
): Promise<HealthReferenceLoadResult> {
  const parts: string[] = [];
  const sources: string[] = [];

  if (userProfileId) {
    const rows = await loadUserProgramMemory(userProfileId);
    for (const row of rows) {
      const heading = SECTION_HEADINGS[row.section as ProgramMemorySection] ?? row.section;
      const text =
        row.body.length > MAX_FILE_CHARS
          ? `${row.body.slice(0, MAX_FILE_CHARS)}\n…[truncated]`
          : row.body;
      parts.push(`## ${heading}\n${text}`);
      sources.push(`db:${row.section}`);
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

/** @deprecated Disk-only loader for provision scripts seeding DB from archived files. */
export function loadArchivedHealthFilesFromDisk(root: string): Array<{ section: ProgramMemorySection; body: string }> {
  const map: Array<{ file: string; section: ProgramMemorySection }> = [
    { file: "user-context.md", section: "user_context" },
    { file: "weekly-schedule.md", section: "weekly_schedule" },
    { file: "program-learnings.md", section: "program_learnings" },
    { file: "recovery-routine.md", section: "recovery_routine" },
  ];
  const out: Array<{ section: ProgramMemorySection; body: string }> = [];
  for (const { file, section } of map) {
    const text = readTextFile(join(root, file), MAX_FILE_CHARS);
    if (text) {
      out.push({ section, body: text });
    }
  }
  return out;
}

/** @deprecated Journal markdown on disk — provision scripts only. */
export function listArchivedJournalFiles(root: string): string[] {
  return listJournalMarkdownFiles(join(root, "journal"));
}
