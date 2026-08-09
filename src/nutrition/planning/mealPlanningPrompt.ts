/**
 * LLM prompts for meal planning draft generation and revision.
 */
import { formatSlotsLabel, type PlannedSlot } from "./parsePlanningSlots.js";
import type { MealPlanEntryInput } from "../parseMealPlanJson.js";

export const MEAL_PLAN_DRAFT_SYSTEM = `You are the Meal Planner specialist for Magnus (Health pillar).

**Scope:** Build a structured meal plan for the requested dates and slots from the user's goals and constraints. Practical home-friendly ideas — not medical nutrition therapy.

**Tone:** Supportive, no food shame. Treat allergies and hard dietary limits as requirements.

**Output format:** First write a concise human-readable plan (day-by-day or grouped — under ~300 words). Then append a fenced JSON block:

\`\`\`json
{"entries":[{"local_date":"YYYY-MM-DD","meal_slot":"breakfast|lunch|dinner|snack","title":"Short meal name","description":"optional prep note"}]}
\`\`\`

Rules for JSON:
- One entry per requested slot per date in the horizon.
- Dates must be YYYY-MM-DD within the given range.
- meal_slot must match requested slots only.
- Titles are short (under 80 chars).`;

export function buildDraftUserPrompt(input: {
  horizonStart: string;
  horizonEnd: string;
  slots: PlannedSlot[];
  constraintsText: string | null;
  healthPreferences: string | null;
  revisionNotes: string | null;
  previousDraftDisplay: string | null;
  anchorBlock: string;
}): string {
  const parts = [
    `Plan meals from **${input.horizonStart}** through **${input.horizonEnd}**.`,
    `Include these slots each day: ${formatSlotsLabel(input.slots)}.`,
    input.anchorBlock,
  ];

  if (input.healthPreferences?.trim()) {
    parts.push(`\nStanding preferences (on file):\n${input.healthPreferences.trim()}`);
  }

  if (input.constraintsText?.trim()) {
    parts.push(`\nThis period specifically:\n${input.constraintsText.trim()}`);
  }

  if (input.revisionNotes?.trim()) {
    parts.push(`\nUser requested changes:\n${input.revisionNotes.trim()}`);
  }

  if (input.previousDraftDisplay?.trim()) {
    parts.push(`\nPrevious draft (revise — do not repeat verbatim unless kept on purpose):\n${input.previousDraftDisplay.trim()}`);
  }

  return parts.join("\n");
}

export function buildDraftContextFromEntries(entries: MealPlanEntryInput[]): string {
  if (!entries.length) {
    return "";
  }
  const byDate = new Map<string, MealPlanEntryInput[]>();
  for (const e of entries) {
    const list = byDate.get(e.local_date) ?? [];
    list.push(e);
    byDate.set(e.local_date, list);
  }
  const lines: string[] = ["Draft entries:"];
  for (const [date, rows] of [...byDate.entries()].sort()) {
    lines.push(
      `- ${date}: ${rows.map((r) => `${r.meal_slot} — ${r.title}`).join("; ")}`,
    );
  }
  return lines.join("\n");
}
