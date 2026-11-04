/**
 * Logs meal items the food catalog couldn't answer, as `food_gap` server events in
 * health_app_events (30-day retention). The food DB agent reads the most-missed names to pick
 * its next batch (docs/FOOD_DB.md). No personal data beyond the food phrase.
 */
import { enqueueEvents } from "../healthApp/events.js";
import type { FoodComponent } from "./foodParse.js";

export function recordFoodGaps(items: FoodComponent[]): void {
  if (!items.length) return;
  const now = new Date().toISOString();
  enqueueEvents(
    items.map((c) => ({
      user_profile_id: null,
      session_id: null,
      source: "server" as const,
      kind: "food_gap",
      name: c.foodKey.slice(0, 120),
      duration_ms: null,
      status: null,
      props: { phrase: c.phrase.slice(0, 200), unit: c.unit, ...(c.size ? { size: c.size } : {}) },
      app_version: null,
      user_agent: null,
      occurred_at: now,
    })),
  );
}
