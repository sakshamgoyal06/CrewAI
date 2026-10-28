import { isMinimalProactiveJobEnabled } from "../config/minimalMode.js";
import { activityCompletionScheduledJob } from "./jobs/activityCompletionJob.js";
import { eventReminderScheduledJob } from "./jobs/eventReminderJob.js";
import { gymHevyReconcileScheduledJob } from "./jobs/gymHevyReconcileJob.js";
import { morningBriefScheduledJob } from "./jobs/morningBriefJob.js";
import { nutritionNightlyScheduledJob } from "./jobs/nutritionNightlyJob.js";
import { notionListSyncScheduledJob } from "./jobs/notionListSyncJob.js";
import { proactiveSubscriptionsJob } from "./jobs/proactiveSubscriptionsJob.js";
import type { ScheduledProactiveJob } from "./jobs/types.js";

const ALL_SCHEDULED_JOBS: ScheduledProactiveJob[] = [
  morningBriefScheduledJob,
  activityCompletionScheduledJob,
  eventReminderScheduledJob,
  gymHevyReconcileScheduledJob,
  nutritionNightlyScheduledJob,
  notionListSyncScheduledJob,
  proactiveSubscriptionsJob,
];

/** Scheduled proactive jobs run on each cron tick. Subscription dispatcher handles activity/inactivity kinds. */
export function scheduledProactiveJobs(): ScheduledProactiveJob[] {
  return ALL_SCHEDULED_JOBS.map((job) => ({
    ...job,
    enabled: () => job.enabled() && isMinimalProactiveJobEnabled(job.id),
  }));
}
