/**
 * Per-user program memory (health coaching context) stored in Supabase.
 * Replaces shared markdown files on disk for multi-user deployments.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase as defaultClient } from "../tools/clients.js";

export const PROGRAM_MEMORY_SECTIONS = [
  "user_context",
  "weekly_schedule",
  "program_learnings",
  "recovery_routine",
] as const;

export type ProgramMemorySection = (typeof PROGRAM_MEMORY_SECTIONS)[number];

/** Map DB section keys to readable headings in prompts. */
export const SECTION_HEADINGS: Record<ProgramMemorySection, string> = {
  user_context: "user-context.md",
  weekly_schedule: "weekly-schedule.md",
  program_learnings: "program-learnings.md",
  recovery_routine: "recovery-routine.md",
};

export type ProgramMemoryRow = {
  section: ProgramMemorySection;
  body: string;
};

export async function loadUserProgramMemory(
  userProfileId: string,
  client: SupabaseClient = defaultClient,
): Promise<ProgramMemoryRow[]> {
  const { data, error } = await client
    .from("user_program_memory")
    .select("section, body")
    .eq("user_profile_id", userProfileId)
    .order("section", { ascending: true });

  if (error) {
    return [];
  }
  return (data ?? [])
    .filter(
      (row): row is { section: ProgramMemorySection; body: string } =>
        PROGRAM_MEMORY_SECTIONS.includes(row.section as ProgramMemorySection) &&
        typeof row.body === "string" &&
        row.body.trim().length > 0,
    )
    .map((row) => ({ section: row.section as ProgramMemorySection, body: row.body.trim() }));
}

export async function upsertUserProgramMemory(
  input: { userProfileId: string; section: ProgramMemorySection; body: string },
  client: SupabaseClient = defaultClient,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await client.from("user_program_memory").upsert(
    {
      user_profile_id: input.userProfileId,
      section: input.section,
      body: input.body,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_profile_id,section" },
  );

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
