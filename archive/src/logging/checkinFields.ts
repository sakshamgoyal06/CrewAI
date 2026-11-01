/**
 * Shared helpers for reading structured check-in fields from list item extra JSON.
 */
import { fetchCheckinItem, fetchListBySlug } from "../lists/listStore.js";

export type CheckinFields = {
  morningIntention?: string;
  energyLevel?: number;
  feeling?: string;
  dayRating?: string;
  joyScore?: number;
  weekPriorities?: string;
  notes?: string;
};

function strExtra(extra: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = extra?.[key];
  if (v == null) {
    return undefined;
  }
  const s = String(v).trim();
  return s || undefined;
}

function numExtra(extra: Record<string, unknown> | undefined, key: string): number | undefined {
  const v = extra?.[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function parseCheckinFields(
  extra: Record<string, unknown> | undefined,
  notes?: string | null,
): CheckinFields {
  return {
    morningIntention: strExtra(extra, "Morning Intention"),
    energyLevel: numExtra(extra, "Energy Level"),
    feeling: strExtra(extra, "How Are You Feeling") ?? strExtra(extra, "Feeling"),
    dayRating: strExtra(extra, "Day Rating"),
    joyScore: numExtra(extra, "Joy Score"),
    weekPriorities: strExtra(extra, "Week Priorities"),
    notes: notes?.trim() || undefined,
  };
}

export async function loadCheckinFields(
  userProfileId: string,
  dateKey: string,
): Promise<CheckinFields> {
  const list = await fetchListBySlug(userProfileId, "checkins");
  if (!list.ok || !list.data) {
    return {};
  }
  const item = await fetchCheckinItem(userProfileId, list.data.id, dateKey);
  if (!item.ok || !item.data) {
    return {};
  }
  return parseCheckinFields(item.data.extra, item.data.notes);
}

export function hasEveningReflectionFields(fields: CheckinFields): boolean {
  if (fields.dayRating) {
    return true;
  }
  if (fields.joyScore != null && fields.joyScore > 0) {
    return true;
  }
  if (fields.feeling) {
    return true;
  }
  if (fields.notes && fields.notes.length >= 12) {
    return true;
  }
  return false;
}

export function hasMorningIntention(fields: CheckinFields): boolean {
  return Boolean(fields.morningIntention?.trim());
}
