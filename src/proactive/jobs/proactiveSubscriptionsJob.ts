import { runProactiveDispatcher } from "../dispatcher.js";
import { proactiveSubscriptionsJobEnabled } from "../env.js";
import type { ScheduledProactiveJob } from "./types.js";

export const proactiveSubscriptionsJob: ScheduledProactiveJob = {
  id: "proactive_subscriptions",
  enabled: proactiveSubscriptionsJobEnabled,
  async run({ now }) {
    await runProactiveDispatcher(now);
  },
};
