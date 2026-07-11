/**
 * Live smoke: Hevy API key + create a minimal routine (no LLM).
 * Run: npx tsx scripts/test-hevy-routine.mts
 *
 * Requires HEVY_API_KEY (or MAGNUS_HEVY_API_KEY) from Hevy Pro →
 * https://hevy.com/settings?developer
 */
import "dotenv/config";

import {
  createHevyRoutine,
  fetchHevyExerciseTemplateCatalog,
  fetchHevyRoutinesPage,
} from "../src/integrations/hevy/hevyClient.js";
import { hevyApiKeyFromEnv } from "../src/integrations/hevy/hevyEnv.js";

const apiKey = hevyApiKeyFromEnv();
if (!apiKey) {
  console.error(
    "Missing HEVY_API_KEY (or MAGNUS_HEVY_API_KEY). Add it to .env — see .env.example.",
  );
  process.exit(1);
}

console.log("1/3 Fetching exercise template catalog…");
const catalog = await fetchHevyExerciseTemplateCatalog(apiKey, { maxPages: 2 });
if (!catalog.ok) {
  console.error("Catalog fetch failed:", catalog.error);
  process.exit(1);
}
if (catalog.templates.length === 0) {
  console.error("Catalog returned zero templates — check API key / account.");
  process.exit(1);
}
const pick =
  catalog.templates.find((t) => /bench|squat|press/i.test(t.title)) ??
  catalog.templates[0]!;
console.log(`   Using exercise: ${pick.title} (${pick.id})`);

const title = `Magnus smoke test ${new Date().toISOString().slice(0, 19)}Z`;
const body = {
  routine: {
    title,
    folder_id: null,
    notes: "Created by scripts/test-hevy-routine.mts — safe to delete in Hevy.",
    exercises: [
      {
        exercise_template_id: pick.id,
        rest_seconds: 90,
        sets: [{ type: "normal" as const, reps: 8 }],
      },
    ],
  },
};

console.log("2/3 Creating routine…");
const created = await createHevyRoutine(apiKey, body);
if (!created.ok) {
  console.error(`Create failed (${created.status ?? "?"}):`, created.error);
  process.exit(1);
}
console.log(`   Created routine id=${created.routine.id} title="${created.routine.title ?? title}"`);

console.log("3/3 Verifying routine appears in list…");
const list = await fetchHevyRoutinesPage(apiKey, 1, 10);
if (!list.ok) {
  console.error("List routines failed:", list.error);
  process.exit(1);
}
const found = (list.data.routines ?? []).some((r) => r.id === created.routine.id);
if (!found) {
  console.warn(
    "Warning: new routine not on first page yet (pagination lag?). Check Hevy app manually.",
  );
} else {
  console.log("   Routine visible in paginated list.");
}

console.log("\nHevy routine create smoke test: OK");
