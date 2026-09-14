#!/usr/bin/env npx tsx
/**
 * Rebuild meal_daily_rollups from meal_logs for one user or all users.
 *
 * Usage:
 *   npx tsx scripts/nutrition/rebuild-rollups.mts
 *   npx tsx scripts/nutrition/rebuild-rollups.mts --user <user_profile_id>
 */
import "dotenv/config";

import { supabase } from "../../src/tools/clients.js";
import { recomputeDailyRollup } from "../../src/nutrition/store/mealRollupStore.js";

function parseArgs(): { userId?: string } {
  const idx = process.argv.indexOf("--user");
  if (idx >= 0 && process.argv[idx + 1]) {
    return { userId: process.argv[idx + 1] };
  }
  return {};
}

async function main(): Promise<void> {
  const { userId } = parseArgs();

  let query = supabase
    .from("meal_logs")
    .select("user_profile_id, local_date")
    .is("deleted_at", null)
    .not("local_date", "is", null);

  if (userId) {
    query = query.eq("user_profile_id", userId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Failed to load meal_logs:", error.message);
    process.exit(1);
  }

  const pairs = new Set<string>();
  for (const row of data ?? []) {
    pairs.add(`${row.user_profile_id as string}|${row.local_date as string}`);
  }

  let ok = 0;
  let fail = 0;
  for (const key of pairs) {
    const [uid, date] = key.split("|");
    const result = await recomputeDailyRollup(uid!, date!);
    if (result.ok) {
      ok += 1;
    } else {
      fail += 1;
      console.warn(`rollup failed ${key}: ${result.error}`);
    }
  }

  console.log(`Rebuilt ${ok} rollups (${fail} failed) from ${pairs.size} user-day pairs.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
