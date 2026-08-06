import { eventReminderScheduledJob } from "./jobs/eventReminderJob.js";
import { morningBriefScheduledJob } from "./jobs/morningBriefJob.js";
import { proactiveSubscriptionsJob } from "./jobs/proactiveSubscriptionsJob.js";
import type { ScheduledProactiveJob } from "./jobs/types.js";

/** Scheduled proactive jobs run on each cron tick. Subscription dispatcher handles activity/inactivity kinds. */
export function scheduledProactiveJobs(): ScheduledProactiveJob[] {
  return [morningBriefScheduledJob, eventReminderScheduledJob, proactiveSubscriptionsJob];
}
