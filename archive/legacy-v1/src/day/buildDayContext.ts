/**
 * Step 6 — shared day context for morning brief and day_overview.
 */
import { isMinimalMode } from "../config/minimalMode.js";
import { startOfLocalDay, localDateKey as eventLocalDateKey } from "../events/eventTime.js";
import { formatLoggedMealsDay } from "../meals/formatLoggedMealsDay.js";
import { sumMealLogsForDay } from "../meals/mealDaySummary.js";
import { localDateKey, timezoneAbbrev } from "../nutrition/localDate.js";
import { offsetDateKey } from "../nutrition/parseMealPlanJson.js";
import { formatPlanDay, getPlanEntriesForDate } from "../nutrition/store/mealPlanStore.js";
import { getSessionsForLocalDate } from "../nutrition/store/mealHistoryStore.js";
import { fetchListBySlug, queryListItems } from "../lists/listStore.js";
import { formatReminderList, listUpcomingReminders } from "../proactive/reminderStore.js";
import { readCalendarEventsDetailed } from "../agents/tools/calendarTool.js";
import { listEventsTool } from "../agents/tools/eventLogTool.js";
import {
  detectDayConflicts,
  formatDayConflicts,
  type DayConflict,
  type DayEvent,
} from "./detectDayConflicts.js";

export type DayContextReminder = {
  at: string;
  label: string;
};

export type DayContextTodo = {
  title: string;
  priority?: string;
  status?: string;
};

export type DayContext = {
  localDate: string;
  label: string;
  timezone: string;
  tzAbbrev: string;
  calendarText: string;
  eventLogText: string;
  remindersText: string;
  reminders: DayContextReminder[];
  /** Open items on the tasks list — the user's todos, highest priority first. */
  todos: DayContextTodo[];
  todosText: string;
  /** Overlaps and likely duplicates in the day, so they are raised rather than read out. */
  conflicts: DayConflict[];
  conflictsText: string;
  plannedMealsText: string;
  loggedMealsText: string;
};

export type BuildDayContextInput = {
  userProfileId: string;
  timezone: string;
  /** Local date YYYY-MM-DD */
  localDate: string;
  label: string;
  /** Days offset from today in the user's timezone (0 = today). */
  offsetDays?: number;
  includeMeals?: boolean;
};

export function resolveOverviewDate(
  timezone: string,
  hint?: string | null,
): { localDate: string; label: string; offsetDays: number } {
  const today = localDateKey(new Date(), timezone);
  const h = hint?.trim().toLowerCase();
  if (h === "tomorrow") {
    return { localDate: offsetDateKey(today, 1), label: "Tomorrow", offsetDays: 1 };
  }
  if (h === "yesterday") {
    return { localDate: offsetDateKey(today, -1), label: "Yesterday", offsetDays: -1 };
  }
  if (h === "today") {
    return { localDate: today, label: "Today", offsetDays: 0 };
  }
  if (h && /^\d{4}-\d{2}-\d{2}$/.test(h)) {
    const offsetDays = Math.round(
      (new Date(`${h}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) /
        (24 * 60 * 60 * 1000),
    );
    return { localDate: h, label: h, offsetDays };
  }
  return { localDate: today, label: "Today", offsetDays: 0 };
}

const PRIORITY_ORDER: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

/** Open todos, highest priority first. A day without them is not the whole day. */
async function loadOpenTodos(
  userProfileId: string,
  limit = 8,
): Promise<DayContextTodo[]> {
  const list = await fetchListBySlug(userProfileId, "tasks");
  if (!list.ok || !list.data) {
    return [];
  }
  const items = await queryListItems({
    userProfileId,
    listId: list.data.id,
    openStatuses: list.data.open_statuses,
    limit: 50,
  });
  if (!items.ok) {
    return [];
  }
  return items.data
    .map((row) => ({
      title: row.title.trim(),
      priority: row.priority ?? undefined,
      status: row.status ?? undefined,
    }))
    .filter((row) => row.title !== "")
    .sort(
      (a, b) =>
        (PRIORITY_ORDER[a.priority ?? ""] ?? 3) - (PRIORITY_ORDER[b.priority ?? ""] ?? 3),
    )
    .slice(0, limit);
}

/** Load calendar, commitments, reminders, todos, and optional meals for one local day. */
export async function buildDayContext(input: BuildDayContextInput): Promise<DayContext> {
  const tz = input.timezone;
  const offsetDays = input.offsetDays ?? 0;
  const includeMeals = input.includeMeals ?? !isMinimalMode();
  const rangeStart = startOfLocalDay(new Date(), tz, offsetDays);
  const rangeEnd = startOfLocalDay(new Date(), tz, offsetDays + 1);
  const tzAbbrev = timezoneAbbrev(tz);
  // Todos are not dated, so they belong to today and ahead — not to a retrospective day.
  const includeTodos = offsetDays >= 0;

  const [
    calendar,
    eventLogText,
    mealEntries,
    loggedSessions,
    loggedDayTotals,
    reminderRows,
    todos,
  ] = await Promise.all([
      readCalendarEventsDetailed({
        startIso: rangeStart.toISOString(),
        endIso: rangeEnd.toISOString(),
        timeZone: tz,
        userProfileId: input.userProfileId,
      }),
      listEventsTool({
        userProfileId: input.userProfileId,
        timeZone: tz,
        from: input.localDate,
        to: input.localDate,
      }),
      includeMeals ? getPlanEntriesForDate(input.userProfileId, input.localDate) : Promise.resolve([]),
      includeMeals
        ? getSessionsForLocalDate(input.userProfileId, input.localDate)
        : Promise.resolve([]),
      includeMeals
        ? sumMealLogsForDay(input.userProfileId, input.localDate)
        : Promise.resolve({ date: input.localDate, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }),
      listUpcomingReminders({
        userProfileId: input.userProfileId,
        timezone: tz,
      }),
      includeTodos ? loadOpenTodos(input.userProfileId) : Promise.resolve([]),
    ]);

  const dayReminders = reminderRows.filter(
    (r) => r.at && eventLocalDateKey(r.at, tz) === input.localDate,
  );
  const remindersText =
    dayReminders.length > 0
      ? formatReminderList(dayReminders, tz).replace(/^Upcoming reminders:\n/, "")
      : "No reminders set for this day.";

  const reminders: DayContextReminder[] = dayReminders.map((r) => ({
    at: r.at!.toISOString(),
    label: r.title.trim() || "Reminder",
  }));

  const todosText =
    todos.length > 0
      ? todos
          .map((t) => `- ${t.title}${t.priority ? ` (${t.priority})` : ""}`)
          .join("\n")
      : includeTodos
        ? "Nothing open on your tasks list."
        : "";

  const calendarDayEvents: DayEvent[] = calendar.events.map((e) => ({
    id: e.id,
    title: e.summary,
    start: e.start,
    end: e.end,
  }));
  const conflicts = detectDayConflicts(calendarDayEvents, tz);
  const conflictsText = formatDayConflicts(conflicts);

  const plannedMealsText = includeMeals
    ? formatPlanDay(mealEntries, input.label, input.localDate)
    : "";
  const loggedMealsText = includeMeals
    ? formatLoggedMealsDay(loggedSessions, loggedDayTotals, input.label, input.localDate)
    : "";

  return {
    localDate: input.localDate,
    label: input.label,
    timezone: tz,
    tzAbbrev,
    calendarText: calendar.text.trim() || "Nothing on Google Calendar.",
    eventLogText: eventLogText.trim() || "No logged commitments for this day.",
    remindersText,
    reminders,
    todos,
    todosText,
    conflicts,
    conflictsText,
    plannedMealsText,
    loggedMealsText,
  };
}

export function formatDayContextSections(
  ctx: DayContext,
  options?: { includeMeals?: boolean },
): string {
  const includeMeals = options?.includeMeals ?? !isMinimalMode();
  const sections = [
    `**${ctx.label}** (${ctx.localDate}, ${ctx.tzAbbrev})`,
    "",
    "**Calendar**",
    ctx.calendarText,
    "",
    "**Commitments (event log)**",
    ctx.eventLogText,
    "",
    "**Reminders**",
    ctx.remindersText,
  ];

  if (ctx.conflictsText) {
    sections.push("", "**Needs a decision** (do not read these out as settled)", ctx.conflictsText);
  }

  if (ctx.todosText) {
    sections.push("", "**Open todos** (tasks list, highest priority first)", ctx.todosText);
  }

  if (includeMeals) {
    sections.push(
      "",
      "**Meals — logged** (counts toward daily calories)",
      ctx.loggedMealsText.trim(),
      "",
      "**Meals — planned** (menu only; not counted until logged)",
      ctx.plannedMealsText.trim() || "No meals planned for this day.",
    );
  }

  return sections.join("\n");
}
