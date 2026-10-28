/**
 * Parse planning horizon from natural language (today, week, N days, …).
 */
import { offsetDateKey } from "../parseMealPlanJson.js";

export type PlanningHorizon = {
  startDate: string;
  endDate: string;
  label: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseExplicitRange(text: string): PlanningHorizon | null {
  const range = text.match(/(\d{4}-\d{2}-\d{2})\s*(?:to|through|–|-)\s*(\d{4}-\d{2}-\d{2})/i);
  if (range?.[1] && range[2] && DATE_RE.test(range[1]) && DATE_RE.test(range[2])) {
    const startDate = range[1] <= range[2] ? range[1] : range[2];
    const endDate = range[1] <= range[2] ? range[2] : range[1];
    return { startDate, endDate, label: `${startDate} → ${endDate}` };
  }
  return null;
}

/** Start date when user anchors to tomorrow / Monday. */
export function parsePlanningStartAnchor(rawMessage: string, today: string): string {
  const lower = rawMessage.toLowerCase();
  if (/\btomorrow\s+is\s+monday\b/.test(lower)) {
    return offsetDateKey(today, 1);
  }
  if (/\bstarting\s+(?:on\s+)?monday\b/.test(lower)) {
    return offsetDateKey(today, 1);
  }
  if (/\b(?:starting|from)\s+tomorrow\b/.test(lower)) {
    return offsetDateKey(today, 1);
  }
  if (/\btomorrow\b/.test(lower) && !/\bthis\s+week\b/.test(lower)) {
    return offsetDateKey(today, 1);
  }
  return today;
}

function parseWeekCount(text: string, today: string): PlanningHorizon | null {
  const m =
    text.match(/\b(?:next|for|over)\s+(\d{1,2})\s*[- ]?\s*weeks?\b/i) ??
    text.match(/\b(\d{1,2})\s*[- ]?\s*weeks?\b/i);
  if (!m?.[1]) {
    return null;
  }
  const weeks = Math.min(4, Math.max(1, Number.parseInt(m[1], 10)));
  const days = weeks * 7;
  const startDate = parsePlanningStartAnchor(text, today);
  const endDate = offsetDateKey(startDate, days - 1);
  return {
    startDate,
    endDate,
    label: `${weeks} week${weeks === 1 ? "" : "s"} (${startDate} → ${endDate})`,
  };
}

function parseDayCount(text: string, today: string): PlanningHorizon | null {
  const m = text.match(/\b(?:next|for)\s+(\d{1,2})\s+days?\b/i);
  if (!m?.[1]) {
    return null;
  }
  const n = Math.min(28, Math.max(1, Number.parseInt(m[1], 10)));
  const startDate = parsePlanningStartAnchor(text, today);
  const endDate = offsetDateKey(startDate, n - 1);
  return {
    startDate,
    endDate,
    label: `${n} day${n === 1 ? "" : "s"} (${startDate} → ${endDate})`,
  };
}

/** Infer planning dates from user text relative to `today` (YYYY-MM-DD). */
export function parsePlanningHorizon(rawMessage: string, today: string): PlanningHorizon | null {
  const text = rawMessage.trim();
  if (!text) {
    return null;
  }

  const explicit = parseExplicitRange(text);
  if (explicit) {
    return explicit;
  }

  const lower = text.toLowerCase();

  const weekCount = parseWeekCount(lower, today);
  if (weekCount) {
    return weekCount;
  }

  if (/\btoday\b/.test(lower) && !/\btomorrow\b/.test(lower) && !/\bweeks?\b/.test(lower)) {
    return { startDate: today, endDate: today, label: "today" };
  }

  if (/\btomorrow\b/.test(lower) && !/\bweeks?\b/.test(lower)) {
    const d = offsetDateKey(today, 1);
    return { startDate: d, endDate: d, label: "tomorrow" };
  }

  if (/\b(?:next|the coming)\s+week\b/.test(lower)) {
    const start = offsetDateKey(today, 1);
    const end = offsetDateKey(today, 7);
    return { startDate: start, endDate: end, label: "next 7 days" };
  }

  if (
    /\b(?:this|the)\s+week\b/.test(lower) ||
    /\bweekly\s+(?:menu|plan|meals?)\b/.test(lower) ||
    /\bmeal\s+plan\s+for\s+(?:the\s+)?week\b/.test(lower)
  ) {
    const startDate = parsePlanningStartAnchor(text, today);
    const end = offsetDateKey(startDate, 6);
    return { startDate, endDate: end, label: "this week (7 days)" };
  }

  if (/\b(?:rest|remainder)\s+of\s+(?:the\s+)?week\b/.test(lower)) {
    const day = new Date(`${today}T12:00:00Z`).getUTCDay();
    const daysLeft = day === 0 ? 0 : 7 - day;
    const end = offsetDateKey(today, daysLeft);
    return { startDate: today, endDate: end, label: "rest of this week" };
  }

  const dayCount = parseDayCount(lower, today);
  if (dayCount) {
    return dayCount;
  }

  return null;
}

export function listDatesInHorizon(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    dates.push(cursor);
    if (cursor === endDate) {
      break;
    }
    cursor = offsetDateKey(cursor, 1);
    if (dates.length > 28) {
      break;
    }
  }
  return dates;
}
