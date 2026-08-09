/**
 * Extract structured meal plan entries from LLM output.
 */
import type { MealSlot } from "./types.js";

export type MealPlanEntryInput = {
  local_date: string;
  meal_slot: Exclude<MealSlot, "unspecified">;
  title: string;
  description?: string | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PLAN_SLOTS = new Set(["breakfast", "lunch", "dinner", "snack"]);

function isPlanSlot(v: unknown): v is Exclude<MealSlot, "unspecified"> {
  return typeof v === "string" && PLAN_SLOTS.has(v);
}

function normalizeEntry(raw: unknown): MealPlanEntryInput | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const local_date = typeof o.local_date === "string" ? o.local_date.trim() : "";
  const meal_slot = o.meal_slot;
  const title = typeof o.title === "string" ? o.title.trim() : "";
  if (!DATE_RE.test(local_date) || !isPlanSlot(meal_slot) || title.length < 2) {
    return null;
  }
  const description =
    typeof o.description === "string" && o.description.trim() ? o.description.trim() : null;
  return { local_date, meal_slot, title, description };
}

function parseJsonObject(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function entriesFromPayload(payload: unknown): MealPlanEntryInput[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const entries = (payload as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries.map(normalizeEntry).filter((e): e is MealPlanEntryInput => e !== null);
}

/** Pull JSON from a ```json fenced block or the first `{...}` object in text. */
export function extractMealPlanJson(llmText: string): MealPlanEntryInput[] | null {
  const fenced = llmText.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const parsed = parseJsonObject(fenced[1].trim());
    const entries = entriesFromPayload(parsed);
    if (entries.length > 0) {
      return entries;
    }
  }

  const braceStart = llmText.indexOf("{");
  const braceEnd = llmText.lastIndexOf("}");
  if (braceStart >= 0 && braceEnd > braceStart) {
    const parsed = parseJsonObject(llmText.slice(braceStart, braceEnd + 1));
    const entries = entriesFromPayload(parsed);
    if (entries.length > 0) {
      return entries;
    }
  }

  return null;
}

/** Remove JSON block from display text shown to the user. */
export function stripMealPlanJsonBlock(llmText: string): string {
  let text = llmText.replace(/```(?:json)?\s*[\s\S]*?```/gi, "").trim();
  const braceStart = text.indexOf('{"entries"');
  if (braceStart >= 0) {
    text = text.slice(0, braceStart).trim();
  }
  return text;
}

export function offsetDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map((x) => Number.parseInt(x, 10));
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
