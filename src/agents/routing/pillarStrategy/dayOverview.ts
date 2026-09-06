/**
 * Holistic day snapshot — calendar, Magnus commitments, planned meals.
 * Used by GENERAL day_overview capability (parser-owned, not regex routing).
 */
import { isMinimalMode } from "../../../config/minimalMode.js";
import { startOfLocalDay, localDateKey as eventLocalDateKey } from "../../../events/eventTime.js";
import { formatLoggedMealsDay } from "../../../meals/formatLoggedMealsDay.js";
import { sumMealLogsForDay } from "../../../meals/mealDaySummary.js";
import { localDateKey, timezoneAbbrev } from "../../../nutrition/localDate.js";
import { offsetDateKey } from "../../../nutrition/parseMealPlanJson.js";
import { formatPlanDay, getPlanEntriesForDate } from "../../../nutrition/store/mealPlanStore.js";
import { getSessionsForLocalDate } from "../../../nutrition/store/mealHistoryStore.js";
import { formatReminderList, listUpcomingReminders } from "../../../proactive/reminderStore.js";
import { readCalendarEvents } from "../../tools/calendarTool.js";
import { listEventsTool } from "../../tools/eventLogTool.js";
import type { AgentContext, AgentResult } from "../../types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function resolveOverviewDate(
  timezone: string | undefined,
  hint?: string | null,
): { localDate: string; label: string } {
  const today = localDateKey(new Date(), timezone);
  const h = hint?.trim().toLowerCase();
  if (h === "tomorrow") {
    return { localDate: offsetDateKey(today, 1), label: "Tomorrow" };
  }
  if (h === "yesterday") {
    return { localDate: offsetDateKey(today, -1), label: "Yesterday" };
  }
  if (h === "today") {
    return { localDate: today, label: "Today" };
  }
  if (h && /^\d{4}-\d{2}-\d{2}$/.test(h)) {
    return { localDate: h, label: h };
  }
  return { localDate: today, label: "Today" };
}

function dateKeyDiff(fromKey: string, toKey: string): number {
  const a = new Date(`${fromKey}T00:00:00Z`).getTime();
  const b = new Date(`${toKey}T00:00:00Z`).getTime();
  return Math.round((b - a) / DAY_MS);
}

export async function executeDayOverviewCapability(
  ctx: AgentContext,
  args: Record<string, unknown> = {},
): Promise<AgentResult> {
  const tz = ctx.timezone ?? "UTC";
  const dateHint =
    typeof args.date_hint === "string" && args.date_hint.trim()
      ? args.date_hint.trim()
      : null;
  const { localDate, label } = resolveOverviewDate(tz, dateHint);
  const today = localDateKey(new Date(), tz);
  const offsetDays = dateKeyDiff(today, localDate);
  const rangeStart = startOfLocalDay(new Date(), tz, offsetDays);
  const rangeEnd = startOfLocalDay(new Date(), tz, offsetDays + 1);
  const tzAbbrev = timezoneAbbrev(tz);

  const [calendarText, eventLogText, mealEntries, loggedSessions, loggedDayTotals, reminderRows] =
    await Promise.all([
    readCalendarEvents({
      startIso: rangeStart.toISOString(),
      endIso: rangeEnd.toISOString(),
      timeZone: tz,
      userProfileId: ctx.userProfileId,
    }),
    listEventsTool({
      userProfileId: ctx.userProfileId,
      timeZone: tz,
      from: localDate,
      to: localDate,
    }),
    isMinimalMode()
      ? Promise.resolve([])
      : getPlanEntriesForDate(ctx.userProfileId, localDate),
    isMinimalMode() ? Promise.resolve([]) : getSessionsForLocalDate(ctx.userProfileId, localDate),
    isMinimalMode()
      ? Promise.resolve({ totalKcal: 0, proteinG: 0, carbsG: 0, fatG: 0 })
      : sumMealLogsForDay(ctx.userProfileId, localDate),
    listUpcomingReminders({
      userProfileId: ctx.userProfileId,
      timezone: tz,
    }),
  ]);

  const dayReminders = reminderRows.filter(
    (r) => r.at && eventLocalDateKey(r.at, tz) === localDate,
  );
  const remindersText =
    dayReminders.length > 0
      ? formatReminderList(dayReminders, tz).replace(/^Upcoming reminders:\n/, "")
      : "No reminders set for this day.";

  const plannedMealsText = formatPlanDay(mealEntries, label, localDate);
  const loggedMealsText = formatLoggedMealsDay(
    loggedSessions,
    loggedDayTotals,
    label,
    localDate,
  );

  const sections = [
    `**${label}** (${localDate}, ${tzAbbrev})`,
    "",
    "**Calendar**",
    calendarText.trim() || "Nothing on Google Calendar.",
    "",
    "**Commitments (event log)**",
    eventLogText.trim() || "No logged commitments for this day.",
    "",
    "**Reminders**",
    remindersText,
  ];

  if (!isMinimalMode()) {
    sections.push(
      "",
      "**Meals — logged** (counts toward daily calories)",
      loggedMealsText.trim(),
      "",
      "**Meals — planned** (menu only; not counted until logged)",
      plannedMealsText.trim() || "No meals planned for this day.",
    );
  }

  const userGraphNote =
    ctx.memoryBlock?.trim() && ctx.memoryBlock.length < 1200
      ? `\n\n_User context (internal — use for tone, not to repeat verbatim):_\n${ctx.memoryBlock.trim().slice(0, 800)}`
      : "";

  return {
    text: sections.join("\n") + userGraphNote,
    metadata: {
      specialist: "Magnus",
      day_overview: true,
      overview_date: localDate,
      overview_label: label,
      pillar_compose: true,
    },
  };
}
